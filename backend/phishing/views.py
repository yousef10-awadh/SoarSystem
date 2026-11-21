import os
import sys
import subprocess
import base64
import hashlib
import ipaddress
import json
import re
import secrets
import socket
from email.utils import parseaddr
from urllib.parse import urlparse
from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.core.validators import validate_email
from django.db import models
from django.conf import settings
from django.core.files.base import ContentFile
from django.core.mail import send_mail
from django.http import HttpResponse
from django.utils.dateparse import parse_datetime
from django.utils import timezone

from rest_framework import viewsets, status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated, AllowAny, IsAdminUser
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser
from rest_framework.decorators import api_view, permission_classes
from rest_framework.decorators import action

from .models import CampaignMetrics, CampaignTrackingToken, PhishingCampaign, PhishingReport, ScanReport
from .serializers import CampaignMetricsSerializer, PhishingCampaignSerializer, PhishingReportSerializer, ScanReportSerializer
from training.models import PhishingSimulationResult


def _normalize_public_domain(value):
    candidate = str(value or '').strip().rstrip('.,;:)]>')
    if not candidate:
        return None
    parsed = urlparse(candidate if '://' in candidate else f'//{candidate}')
    host = (parsed.hostname or '').rstrip('.').lower()
    try:
        host = host.encode('idna').decode('ascii')
    except UnicodeError:
        return None
    reserved_example_domains = {'example.com', 'example.net', 'example.org'}
    if (
        not host
        or '.' not in host
        or host in {'localhost', 'example'}
        or host in reserved_example_domains
        or any(host.endswith(f'.{reserved}') for reserved in reserved_example_domains)
        or host.endswith(('.example', '.local', '.internal', '.test', '.invalid'))
    ):
        return None
    try:
        ipaddress.ip_address(host)
        return None
    except ValueError:
        pass
    labels = host.split('.')
    if len(host) > 253 or any(not label or len(label) > 63 or not re.fullmatch(r'[a-z0-9](?:[a-z0-9-]*[a-z0-9])?', label) for label in labels):
        return None
    return host


def _resolve_public_domain(domain):
    """Resolve a domain through the host's configured DNS and allow public IPs only."""
    try:
        records = socket.getaddrinfo(domain, 443, type=socket.SOCK_STREAM)
        addresses = {record[4][0] for record in records}
    except socket.gaierror as first_error:
        # Some Windows resolver configurations fail the combined lookup while IPv4 works.
        try:
            _, _, ipv4_addresses = socket.gethostbyname_ex(domain)
            addresses = set(ipv4_addresses)
        except socket.gaierror:
            raise first_error

    if not addresses:
        raise socket.gaierror(f'No DNS addresses returned for {domain}')
    parsed_addresses = {ipaddress.ip_address(address) for address in addresses}
    if any(not address.is_global for address in parsed_addresses):
        raise ValueError(f'{domain} resolves to a non-public address')
    return sorted(addresses)


def _extract_report_domains(report):
    domains = set()
    body = report.email_body or ''
    searchable = re.sub(r'[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}', ' ', body, flags=re.I)
    for url in re.findall(r'https?://[^\s<>"\])]+', searchable, flags=re.I):
        domain = _normalize_public_domain(url)
        if domain:
            domains.add(domain)
    for candidate in re.findall(r'\b(?:[a-z0-9-]+\.)+[a-z]{2,63}\b', searchable, flags=re.I):
        domain = _normalize_public_domain(candidate)
        if domain:
            domains.add(domain)
    return domains


def _build_report_email_source(report):
    lines = [
        f"From: {report.sender_email or 'unknown@sender.com'}",
        f"Subject: {report.email_subject or 'No Subject'}",
        f"Date: {report.email_date.isoformat() if report.email_date else ''}",
    ]
    raw_headers = report.raw_headers or ''
    try:
        parsed_headers = json.loads(raw_headers)
    except (TypeError, json.JSONDecodeError):
        parsed_headers = None

    if isinstance(parsed_headers, dict):
        header_maps = [parsed_headers.get('headers', {}), parsed_headers.get('metadata', {})]
        allowed = {'reply-to', 'return-path', 'received', 'authentication-results', 'received-spf', 'dkim-signature', 'message-id', 'to', 'cc'}
        for header_map in header_maps:
            if not isinstance(header_map, dict):
                continue
            for name, value in header_map.items():
                normalized = str(name).strip().lower()
                if normalized not in allowed:
                    continue
                values = value if isinstance(value, list) else [value]
                for header_value in values:
                    clean_value = re.sub(r'[\r\n]+', ' ', str(header_value)).strip()
                    if clean_value:
                        formatted_name = '-'.join(part.capitalize() for part in normalized.split('-'))
                        lines.append(f'{formatted_name}: {clean_value}')
    elif raw_headers:
        lines.extend(line for line in raw_headers.splitlines() if ':' in line and not line.lower().startswith(('from:', 'subject:', 'date:')))

    lines.extend(['MIME-Version: 1.0', 'Content-Type: text/plain; charset=utf-8', '', report.email_body or ''])
    return '\r\n'.join(lines)


def _domain_scan_cards(domain, output):
    sections = {'overview': []}
    current = 'overview'
    for line in output.splitlines():
        heading = re.match(r'^===\s*(.*?)\s*===$', line.strip())
        if heading:
            current = heading.group(1).strip().lower().replace(' ', '_')
            sections[current] = []
        elif line.strip():
            sections.setdefault(current, []).append(line.strip())
    resolved_ips = sorted(set(re.findall(r'\[\+\]\s+Resolved IP:\s*([0-9a-fA-F:.]+)', output)))
    http_headers = []
    for line in sections.get('http_headers', []):
        if ':' in line:
            name, value = line.split(':', 1)
            http_headers.append({'name': name.strip(), 'value': value.strip()})
    redirects = [line for line in sections.get('redirect_trace', []) if re.match(r'^(?:\d{3}\s+->|Location:)', line, flags=re.I)]
    return {
        'domain': domain,
        'resolved_ips': resolved_ips,
        'whois': '\n'.join(sections.get('whois', [])),
        'http_headers': http_headers,
        'robots': '\n'.join(sections.get('robots.txt', sections.get('robots', []))),
        'redirects': redirects,
        'recommendations': sections.get('report_this_phishing_site', []),
    }


def _campaign_recipients(campaign):
    if not campaign.target_department_id:
        return None, 'حدد قسمًا مستهدفًا قبل إرسال الحملة.'
    if not settings.CAMPAIGN_ALLOWED_RECIPIENT_DOMAINS and not settings.CAMPAIGN_TEST_RECIPIENTS:
        return None, 'أضف نطاقًا مسموحًا أو بريد اختبار محددًا إلى إعدادات البيئة قبل الإرسال.'

    User = get_user_model()
    recipients_by_email = {}
    users = User.objects.filter(
        is_active=True,
        role='employee',
        department_id=campaign.target_department_id,
    ).exclude(email='').values_list('id', 'email')
    for user_id, value in users:
        email = str(value or '').strip().lower()
        try:
            validate_email(email)
        except ValidationError:
            continue
        domain = email.rpartition('@')[2]
        if domain in settings.CAMPAIGN_ALLOWED_RECIPIENT_DOMAINS or email in settings.CAMPAIGN_TEST_RECIPIENTS:
            recipients_by_email[email] = user_id

    recipients = sorted(((user_id, email) for email, user_id in recipients_by_email.items()), key=lambda item: item[1])
    if not recipients:
        return None, 'لا يوجد موظفون نشطون ببريد صالح ضمن القسم والنطاقات المسموح بها.'
    if len(recipients) > settings.CAMPAIGN_MAX_RECIPIENTS:
        return None, f'عدد المستلمين ({len(recipients)}) يتجاوز الحد الآمن للحملة الواحدة ({settings.CAMPAIGN_MAX_RECIPIENTS}).'
    return recipients, None


def _campaign_delivery_error():
    if settings.CAMPAIGN_DELIVERY_MODE != 'smtp':
        return 'الإرسال الفعلي غير مفعّل. غيّر CAMPAIGN_DELIVERY_MODE إلى smtp بعد إعداد خادم البريد.'
    if settings.DEBUG and not settings.CAMPAIGN_ALLOW_REAL_SEND_IN_DEBUG:
        return 'الإرسال الخارجي معطل في وضع التطوير. فعّل CAMPAIGN_ALLOW_REAL_SEND_IN_DEBUG فقط للاختبار المصرح به.'
    if not settings.EMAIL_HOST or settings.EMAIL_HOST.lower() in {'localhost', '127.0.0.1', 'mailpit'}:
        return 'اضبط EMAIL_HOST على خادم SMTP فعلي؛ لا يمكن إطلاق حملة عبر Mailpit.'
    if settings.EMAIL_USE_TLS and settings.EMAIL_USE_SSL:
        return 'اختر TLS أو SSL لخادم SMTP، ولا تفعّلهما معًا.'
    public_base = urlparse(settings.CAMPAIGN_PUBLIC_BASE_URL)
    if public_base.scheme not in {'https', 'http'} or not public_base.hostname:
        return 'اضبط CAMPAIGN_PUBLIC_BASE_URL على عنوان يمكن للمستلمين الوصول إليه لصفحة التوعية.'
    if not settings.DEBUG and public_base.scheme != 'https':
        return 'يجب أن يستخدم رابط الحملة العام HTTPS خارج وضع التطوير.'
    return None


def _send_campaign_to_recipients(campaign, recipients):
    sent = failed = 0
    for employee_id, recipient in recipients:
        raw_token = secrets.token_urlsafe(32)
        token_hash = hashlib.sha256(raw_token.encode('utf-8')).hexdigest()
        tracking_token = CampaignTrackingToken.objects.create(
            campaign=campaign,
            department=campaign.target_department,
            employee_id=employee_id,
            token_hash=token_hash,
        )
        click_url = f"{settings.CAMPAIGN_PUBLIC_BASE_URL}/api/phishing/campaigns/click/{raw_token}/"
        message = f"{campaign.email_template_body.rstrip()}\n\nرابط المحاكاة التدريبية:\n{click_url}"
        try:
            delivered = send_mail(
                subject=campaign.email_subject,
                message=message,
                from_email=settings.DEFAULT_FROM_EMAIL,
                recipient_list=[recipient],
                fail_silently=False,
            )
            if delivered:
                sent += 1
            else:
                failed += 1
                tracking_token.delete()
        except Exception:
            failed += 1
            tracking_token.delete()

    if sent:
        metrics, _ = CampaignMetrics.objects.get_or_create(campaign=campaign, department=campaign.target_department)
        CampaignMetrics.objects.filter(pk=metrics.pk).update(total_sent=models.F('total_sent') + sent)
        PhishingCampaign.objects.filter(pk=campaign.pk).update(
            total_sent=models.F('total_sent') + sent,
            status='completed',
        )
        campaign.refresh_from_db()
    return sent, failed


class N8nPhishingWebhookView(APIView):
    permission_classes = [AllowAny]
    parser_classes = [JSONParser, MultiPartParser, FormParser]

    def post(self, request, *args, **kwargs):
        api_key = request.headers.get('X-N8N-API-KEY')
        if api_key != settings.N8N_WEBHOOK_SECRET:
            return Response(
                {"error": "Unauthorized webhook request. Invalid API Key."},
                status=status.HTTP_401_UNAUTHORIZED
            )

        data = request.data
        raw_date = data.get('email_date')
        parsed_date = parse_datetime(str(raw_date)) if raw_date else None
        if not parsed_date:
            parsed_date = timezone.now()

        report = PhishingReport(
            sender_email=data.get('sender_email', 'unknown@sender.com'),
            email_subject=data.get('email_subject', 'No Subject'),
            email_body=data.get('email_body', ''),
            email_date=parsed_date,
            raw_headers=data.get('raw_headers', ''),
            reporter_ou=data.get('reporter_ou', 'General'),
            analysis_status=data.get('analysis_status', 'queued_sandbox'),
            analyst_notes=data.get('analyst_notes', '')
        )

        if 'raw_email_file' in request.FILES:
            report.raw_email_file = request.FILES['raw_email_file']
        elif data.get('raw_email_base64'):
            try:
                file_content = base64.b64decode(data.get('raw_email_base64'))
                file_name = data.get('file_name', f"suspicious_{int(timezone.now().timestamp())}.eml")
                report.raw_email_file.save(file_name, ContentFile(file_content), save=False)
            except Exception:
                pass

        report.save()

        tracked_campaign_token = re.search(
            r'/api/phishing/campaigns/click/([A-Za-z0-9_-]{20,})',
            f"{report.email_body}\n{report.raw_headers}",
        )
        if tracked_campaign_token:
            token_hash = hashlib.sha256(tracked_campaign_token.group(1).encode('utf-8')).hexdigest()
            tracking = CampaignTrackingToken.objects.select_related('campaign', 'department').filter(token_hash=token_hash).first()
            if tracking and CampaignTrackingToken.objects.filter(pk=tracking.pk, reported_at__isnull=True).update(reported_at=timezone.now()):
                metrics, _ = CampaignMetrics.objects.get_or_create(campaign=tracking.campaign, department=tracking.department)
                CampaignMetrics.objects.filter(pk=metrics.pk).update(total_reported=models.F('total_reported') + 1)
                PhishingCampaign.objects.filter(pk=tracking.campaign_id).update(total_reported=models.F('total_reported') + 1)
                if tracking.employee_id:
                    PhishingSimulationResult.objects.filter(campaign_tracking_hash=token_hash).update(
                        result='reported',
                        note='تم الإبلاغ عن رسالة المحاكاة.',
                    )

        # Backward-compatible reporting for trusted n8n workflows with an explicit campaign ID.
        campaign_id = data.get('campaign_id')
        if campaign_id and not tracked_campaign_token:
            campaign = PhishingCampaign.objects.filter(id=campaign_id).first()
            if campaign:
                department = campaign.target_department
                if department:
                    CampaignMetrics.objects.filter(campaign=campaign, department=department).update(
                        total_reported=models.F('total_reported') + 1
                    )
                PhishingCampaign.objects.filter(id=campaign.id).update(total_reported=models.F('total_reported') + 1)

        serializer = PhishingReportSerializer(report)
        return Response(
            {
                "status": "success",
                "message": "Suspicious email captured and sent to dashboard.",
                "report": serializer.data
            },
            status=status.HTTP_201_CREATED
        )


class DashboardPhishingReportViewSet(viewsets.ModelViewSet):
    queryset = PhishingReport.objects.all()
    serializer_class = PhishingReportSerializer
    permission_classes = [IsAdminUser]

    @action(detail=True, methods=['post'], url_path='analyze')
    def analyze_report(self, request, pk=None):
        report = self.get_object()
        tool = request.data.get('tool')

        if tool not in {'email', 'domain', 'holehe'}:
            return Response({'error': 'اختر محلل البريد أو فاحص النطاق أو Holehe.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            if tool == 'email':
                if report.raw_email_file:
                    report.raw_email_file.open('rb')
                    try:
                        raw_email = report.raw_email_file.read(10 * 1024 * 1024 + 1)
                    finally:
                        report.raw_email_file.close()
                    if len(raw_email) > 10 * 1024 * 1024:
                        return Response({'error': 'حجم ملف البريد يتجاوز الحد المسموح للتحليل.'}, status=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE)
                else:
                    raw_email = _build_report_email_source(report).encode('utf-8', errors='replace')

                analyzer_dir = str(settings.BASE_DIR / 'phishing-email-analyzer')
                if not os.path.isdir(os.path.join(analyzer_dir, 'phishanalyzer')):
                    return Response({'error': 'ملفات Phishing Email Analyzer غير موجودة في مجلد الباكند.'}, status=status.HTTP_503_SERVICE_UNAVAILABLE)
                if analyzer_dir not in sys.path:
                    sys.path.insert(0, analyzer_dir)
                try:
                    from phishanalyzer.analyzer import analyze_bytes
                    from phishanalyzer.parser import EmailParseError
                except ImportError as exc:
                    return Response({'error': f'تعذر تحميل محلل البريد من مجلد المشروع: {exc}'}, status=status.HTTP_503_SERVICE_UNAVAILABLE)
                try:
                    analyzed_email = analyze_bytes(raw_email, source=f'بلاغ البريد #{report.id}')
                except EmailParseError as exc:
                    return Response({'error': f'تعذر قراءة رسالة البريد: {exc}'}, status=status.HTTP_422_UNPROCESSABLE_ENTITY)
                tool_result = {'tool': tool, 'label': 'Phishing Email Analyzer', 'report': analyzed_email.to_dict()}

            elif tool == 'holehe':
                _, parsed_email = parseaddr(str(report.sender_email or '').strip())
                email = (parsed_email or str(report.sender_email or '')).strip().strip('<> ,;').lower()
                if not re.fullmatch(r"[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?(?:\.[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?)+", email, flags=re.I):
                    return Response({'error': 'عنوان المرسل غير صالح لفحص Holehe.'}, status=status.HTTP_400_BAD_REQUEST)
                holehe_exe = os.path.join(os.path.dirname(sys.executable), 'holehe.exe' if os.name == 'nt' else 'holehe')
                if not os.path.isfile(holehe_exe):
                    return Response({'error': 'Holehe غير مثبت في بيئة الباكند.'}, status=status.HTTP_503_SERVICE_UNAVAILABLE)
                scan = subprocess.run(
                    [holehe_exe, email],
                    capture_output=True,
                    text=True,
                    encoding='utf-8',
                    errors='replace',
                    timeout=120,
                    env={**os.environ, 'PYTHONIOENCODING': 'utf-8'},
                )
                output = scan.stdout or scan.stderr
                if scan.returncode != 0 and not scan.stdout:
                    return Response({'error': output[-1500:] or 'تعذر تشغيل Holehe.'}, status=status.HTTP_422_UNPROCESSABLE_ENTITY)
                accounts = [line.replace('[+]', '').strip() for line in output.splitlines() if '[+]' in line and 'Email used' not in line]
                tool_result = {'tool': tool, 'label': 'Holehe — اكتشاف الحسابات المرتبطة بالبريد', 'report': {'email': email, 'accounts': accounts}}

            else:
                domain = _normalize_public_domain(request.data.get('domain', ''))
                if not domain or domain not in _extract_report_domains(report):
                    return Response({'error': 'اختر نطاقًا عامًا موجودًا في هذا البلاغ.'}, status=status.HTTP_400_BAD_REQUEST)

                try:
                    _resolve_public_domain(domain)
                except socket.gaierror:
                    return Response({'error': f'تعذر العثور على سجل DNS للنطاق {domain}. تحقق من اتصال الإنترنت وإعدادات DNS في الجهاز الذي يعمل عليه Django.'}, status=status.HTTP_400_BAD_REQUEST)
                except ValueError:
                    return Response({'error': 'تم إيقاف الفحص لأن النطاق يحل إلى عنوان غير عام.'}, status=status.HTTP_400_BAD_REQUEST)

                scanner_dir = settings.BASE_DIR / 'PHISH_HUNTER_PRO'
                scan = subprocess.run(
                    [sys.executable, 'scanner.py', domain],
                    capture_output=True,
                    text=True,
                    encoding='utf-8',
                    errors='replace',
                    cwd=str(scanner_dir),
                    timeout=90,
                    env={**os.environ, 'PYTHONIOENCODING': 'utf-8'},
                )
                output = scan.stdout or scan.stderr
                if scan.returncode != 0 or not output:
                    return Response({'error': output[-1500:] or 'تعذر فحص النطاق.'}, status=status.HTTP_422_UNPROCESSABLE_ENTITY)
                tool_result = {'tool': tool, 'label': 'PHISH_HUNTER_PRO — فحص النطاق', 'report': _domain_scan_cards(domain, output)}

            try:
                analysis_notes = json.loads(report.analyst_notes or '{}')
                if not isinstance(analysis_notes, dict):
                    analysis_notes = {'previous_notes': report.analyst_notes}
            except (TypeError, json.JSONDecodeError):
                analysis_notes = {'previous_notes': report.analyst_notes}
            tool_result['ran_at'] = timezone.now().isoformat()
            if not isinstance(analysis_notes.get('tool_results'), list):
                analysis_notes['tool_results'] = []
            analysis_notes['tool_results'].append(tool_result)
            analysis_notes['tool_results'] = analysis_notes['tool_results'][-20:]
            report.analyst_notes = json.dumps(analysis_notes, ensure_ascii=False)
            report.save(update_fields=['analyst_notes'])

            serializer = self.get_serializer(report)
            return Response({'result': tool_result, 'report': serializer.data})
        except subprocess.TimeoutExpired:
            return Response({'error': 'انتهى الوقت المحدد للأداة قبل اكتمال الفحص.'}, status=status.HTTP_504_GATEWAY_TIMEOUT)
        except (OSError, json.JSONDecodeError) as exc:
            return Response({'error': f'تعذر تشغيل أداة التحليل: {exc}'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class PhishingCampaignViewSet(viewsets.ModelViewSet):
    queryset = PhishingCampaign.objects.all()
    serializer_class = PhishingCampaignSerializer
    permission_classes = [IsAdminUser]

    @action(detail=True, methods=['get'], url_path='delivery-preview')
    def delivery_preview(self, request, pk=None):
        campaign = self.get_object()
        delivery_error = _campaign_delivery_error()
        if delivery_error:
            return Response({'error': delivery_error}, status=status.HTTP_409_CONFLICT)
        recipients, error = _campaign_recipients(campaign)
        if error:
            return Response({'error': error}, status=status.HTTP_400_BAD_REQUEST)
        return Response({
            'campaign': campaign.name,
            'department': campaign.target_department.name,
            'recipient_count': len(recipients),
            'recipient_domain': sorted({email.rpartition('@')[2] for _, email in recipients}),
            'max_recipients': settings.CAMPAIGN_MAX_RECIPIENTS,
        })

    @action(detail=True, methods=['post'], url_path='launch')
    def launch(self, request, pk=None):
        campaign = self.get_object()
        delivery_error = _campaign_delivery_error()
        if delivery_error:
            return Response({'error': delivery_error}, status=status.HTTP_409_CONFLICT)
        if request.data.get('confirm') is not True:
            return Response({'error': 'أكد الإرسال بعد مراجعة معاينة المستلمين.'}, status=status.HTTP_400_BAD_REQUEST)
        if campaign.status not in {'draft', 'scheduled'}:
            return Response({'error': 'هذه الحملة سبق تشغيلها أو أنها قيد التشغيل.'}, status=status.HTTP_409_CONFLICT)

        recipients, error = _campaign_recipients(campaign)
        if error:
            return Response({'error': error}, status=status.HTTP_400_BAD_REQUEST)

        sent, failed = _send_campaign_to_recipients(campaign, recipients)

        if not sent:
            return Response({'error': f'لم ينجح إرسال أي رسالة من أصل {len(recipients)}. تحقق من إعدادات SMTP وسجل Django.'}, status=status.HTTP_503_SERVICE_UNAVAILABLE)
        return Response({
            'message': 'انتهت محاولة إرسال الحملة إلى القسم المحدد.',
            'sent': sent,
            'failed': failed,
            'status': campaign.status,
            'metrics': 'تُحفظ مجمعة على مستوى القسم فقط.',
        }, status=status.HTTP_200_OK)

    @action(detail=True, methods=['post'], url_path='send-test')
    def send_test(self, request, pk=None):
        campaign = self.get_object()
        recipient = str(request.data.get('recipient_email', '')).strip().lower()
        if settings.CAMPAIGN_DELIVERY_MODE == 'mailpit':
            if not settings.DEBUG or settings.EMAIL_HOST not in {'127.0.0.1', 'localhost', 'mailpit'}:
                return Response({'error': 'إرسال Mailpit متاح في وضع التطوير المحلي فقط.'}, status=status.HTTP_403_FORBIDDEN)
            if not recipient.endswith('.test') or '@' not in recipient:
                return Response({'error': 'مستلم Mailpit يجب أن ينتهي نطاقه بـ .test.'}, status=status.HTTP_400_BAD_REQUEST)
            test_subject = f"[MIRSAD TEST] {campaign.email_subject}"
            success_message = 'تم حفظ رسالة الاختبار محليًا في Mailpit؛ لم تصل إلى بريد خارجي.'
        elif settings.CAMPAIGN_DELIVERY_MODE == 'smtp':
            if settings.DEBUG and not settings.CAMPAIGN_ALLOW_REAL_SEND_IN_DEBUG:
                return Response({'error': 'اختبار SMTP الخارجي معطل في التطوير حتى تفعّل السماح الصريح.'}, status=status.HTTP_403_FORBIDDEN)
            if settings.EMAIL_HOST.lower() in {'127.0.0.1', 'localhost', 'mailpit'}:
                return Response({'error': 'اضبط EMAIL_HOST على خادم SMTP فعلي.'}, status=status.HTTP_409_CONFLICT)
            if recipient not in settings.CAMPAIGN_TEST_RECIPIENTS:
                return Response({'error': 'أضف بريدك الاختباري إلى CAMPAIGN_TEST_RECIPIENTS قبل الإرسال.'}, status=status.HTTP_403_FORBIDDEN)
            test_subject = f"[MIRSAD SMTP TEST] {campaign.email_subject}"
            success_message = 'أُرسلت رسالة الاختبار إلى العنوان المصرح به فقط؛ لم تُرسل الحملة إلى الموظفين.'
        else:
            return Response({'error': 'وضع إرسال الحملات غير معروف.'}, status=status.HTTP_409_CONFLICT)

        body = (
            f"{campaign.email_template_body}\n\n"
            "---\nرسالة اختبار من مرصاد للتحقق من إعدادات البريد."
        )
        try:
            sent_count = send_mail(
                subject=test_subject,
                message=body,
                from_email=settings.DEFAULT_FROM_EMAIL,
                recipient_list=[recipient],
                fail_silently=False,
            )
        except Exception:
            return Response({'error': 'تعذر الاتصال بخادم البريد أو إرسال رسالة الاختبار. راجع إعدادات SMTP وسجل Django.'}, status=status.HTTP_503_SERVICE_UNAVAILABLE)

        if sent_count:
            return Response({
                'message': success_message,
                'recipient': recipient,
                'mailpit_url': 'http://localhost:8025' if settings.CAMPAIGN_DELIVERY_MODE == 'mailpit' else None,
            }, status=status.HTTP_200_OK)
        return Response({
            'error': 'لم يقبل خادم البريد رسالة الاختبار.'
        }, status=status.HTTP_503_SERVICE_UNAVAILABLE)

class CampaignMetricsViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = CampaignMetrics.objects.select_related('campaign', 'department').all()
    serializer_class = CampaignMetricsSerializer
    permission_classes = [IsAdminUser]


@api_view(['GET'])
@permission_classes([AllowAny])
def campaign_click(request, token):
    token_hash = hashlib.sha256(token.encode('utf-8')).hexdigest()
    tracking = CampaignTrackingToken.objects.select_related('campaign', 'department').filter(token_hash=token_hash).first()
    if not tracking:
        return HttpResponse('رابط التوعية غير صالح أو انتهت صلاحيته.', status=404, content_type='text/plain; charset=utf-8')

    if CampaignTrackingToken.objects.filter(pk=tracking.pk, clicked_at__isnull=True).update(clicked_at=timezone.now()):
        metrics, _ = CampaignMetrics.objects.get_or_create(campaign=tracking.campaign, department=tracking.department)
        CampaignMetrics.objects.filter(pk=metrics.pk).update(total_clicked=models.F('total_clicked') + 1)
        if tracking.employee_id:
            PhishingSimulationResult.objects.create(
                user_id=tracking.employee_id,
                subject=tracking.campaign.email_subject,
                result='clicked',
                note='نقرت على رابط محاكاة توعوية. لم تُجمع أي كلمة مرور أو بيانات تسجيل دخول.',
                campaign_tracking_hash=token_hash,
            )

    page = '''<!doctype html><html lang="ar" dir="rtl"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>محاكاة توعوية</title><body style="font-family:Tahoma,Arial,sans-serif;background:#f1f5f9;color:#17324d;display:grid;place-items:center;min-height:90vh"><main style="max-width:620px;margin:20px;padding:32px;background:white;border:1px solid #dbe4ec;border-radius:20px"><h1>هذه رسالة محاكاة توعوية</h1><p>تم تسجيل التفاعل بصورة مجمعة على مستوى القسم لمساعدة المؤسسة على تحسين التدريب.</p><p>لم نطلب كلمة مرور ولم نجمع بيانات تسجيل دخولك.</p></main></body></html>'''
    response = HttpResponse(page, content_type='text/html; charset=utf-8')
    response['Cache-Control'] = 'no-store'
    response['X-Content-Type-Options'] = 'nosniff'
    response['Content-Security-Policy'] = "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'"
    return response


@api_view(['GET'])
@permission_classes([IsAdminUser])
def get_scan_reports(request):
    reports = ScanReport.objects.all().order_by('-created_at')[:10]
    serializer = ScanReportSerializer(reports, many=True)
    return Response(serializer.data)


@api_view(['POST'])
@permission_classes([IsAdminUser])
def run_tool_scan(request):
    target = request.data.get('target')
    scan_option = str(request.data.get('scan_option', '1'))
    hidden_data = request.data.get('hidden_data')
    
    if not target:
        return Response({"error": "Target input is required"}, status=400)

    # Expose only the email-analysis steps, Holehe, and the read-only domain scanner.
    # PHISH_HUNTER_PRO option 3 performs broad reconnaissance (including Nmap).
    allowed_options = {'workflow_full', 'wf_step1', 'wf_step2', 'wf_step3', 'wf_step4', 'wf_step5', '1'}
    if scan_option not in allowed_options:
        return Response(
            {'error': 'الخيار غير مدعوم. المسموح: تحليل البريد، Holehe، أو فحص النطاق للقراءة فقط.'},
            status=status.HTTP_400_BAD_REQUEST,
        )
    
    custom_env = os.environ.copy()
    custom_env["PYTHONIOENCODING"] = "utf-8"

    try:
        # ==========================================
        # 1. أداة HOLEHE (اكتشاف الحسابات المرتبطة)
        # ==========================================
        if scan_option == 'wf_step2':
            holehe_exe = os.path.join(os.path.dirname(sys.executable), 'holehe.exe' if os.name == 'nt' else 'holehe')
            
            result = subprocess.run(
                [holehe_exe, target],
                capture_output=True,
                text=True,
                encoding='utf-8',
                env=custom_env,
                timeout=120
            )
            raw_output = result.stdout if result.stdout else result.stderr
            
            accounts = [line.replace('[+]', '').strip() for line in raw_output.splitlines() if '[+]' in line and 'Email used' not in line]
            clean_output = json.dumps(
                {'tool': 'holehe', 'report': {'email': target, 'accounts': accounts}},
                ensure_ascii=False,
            )

            report = ScanReport.objects.create(
                target=target,
                scan_type='Holehe (Account Discovery)',
                output_data=clean_output,
                status='SUCCESS' if result.returncode == 0 else 'FAILED'
            )
            return Response({"message": "Holehe scan executed!", "report_id": report.id})

        # ==========================================
        # 2. أداة PHISHING EMAIL ANALYZER (تحليل الرسالة)
        # ==========================================
        elif scan_option == 'workflow_full' or scan_option in ['wf_step1', 'wf_step3', 'wf_step4', 'wf_step5']:
            # حفظ الملف بامتداد .eml لكي تتعرف عليه الأداة مباشرة بدون خطأ الهيدر
            temp_file_path = os.path.join(settings.BASE_DIR, 'temp_email_analysis.eml')
            
            content_to_analyze = hidden_data if hidden_data else target
            
            with open(temp_file_path, 'w', encoding='utf-8') as f:
                f.write(content_to_analyze)

            analyzer_dir = os.path.join(settings.BASE_DIR, 'phishing-email-analyzer')
            
            # بدون علامة -f، تمرير المسار مباشرة لتعمل الأداة بنجاح
            result = subprocess.run(
                [sys.executable, '-m', 'phishanalyzer', temp_file_path],
                cwd=analyzer_dir, 
                capture_output=True,
                text=True,
                encoding='utf-8',
                env=custom_env,
                timeout=60
            )
            
            if os.path.exists(temp_file_path):
                os.remove(temp_file_path)

            raw_output = result.stdout if result.stdout else result.stderr
            clean_output = "=== FULL EMAIL INVESTIGATION REPORT ===\n" + raw_output

            report = ScanReport.objects.create(
                target=target,
                scan_type='Phishing Email Analyzer',
                output_data=clean_output,
                status='SUCCESS' if result.returncode == 0 else 'FAILED'
            )
            return Response({"message": "Email analysis executed!", "report_id": report.id})

        # ==========================================
        # 3. أداة PHISH HUNTER PRO (فحص الروابط والنطاقات)
        # ==========================================
        else:
            domain = _normalize_public_domain(target)
            if not domain:
                return Response({'error': 'أدخل نطاقًا عامًا صالحًا للفحص.'}, status=status.HTTP_400_BAD_REQUEST)
            try:
                _resolve_public_domain(domain)
            except socket.gaierror:
                return Response({'error': f'تعذر العثور على سجل DNS للنطاق {domain}. تحقق من اتصال الإنترنت وإعدادات DNS في الجهاز الذي يعمل عليه Django.'}, status=status.HTTP_400_BAD_REQUEST)
            except ValueError:
                return Response({'error': 'تم إيقاف الفحص لأن النطاق يحل إلى عنوان غير عام.'}, status=status.HTTP_400_BAD_REQUEST)

            scanner_path = os.path.join(settings.BASE_DIR, 'PHISH_HUNTER_PRO', 'scanner.py')
            result = subprocess.run(
                [sys.executable, scanner_path, domain],
                capture_output=True,
                text=True,
                encoding='utf-8',
                env=custom_env,
                timeout=180
            )
            
            raw_output = result.stdout if result.stdout else result.stderr
            clean_output = json.dumps(
                {'tool': 'domain', 'report': _domain_scan_cards(domain, raw_output)},
                ensure_ascii=False,
            )
            
            report = ScanReport.objects.create(
                target=target,
                scan_type='PHISH_HUNTER_PRO (Read-only domain scan)',
                output_data=clean_output,
                status='SUCCESS' if result.returncode == 0 else 'FAILED'
            )
            return Response({"message": "Phish Hunter scan executed!", "report_id": report.id})
            
    except Exception as e:
        return Response({"error": str(e)}, status=500)

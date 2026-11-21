from django.db import models
from accounts.models import Department

class PhishingCampaign(models.Model):
    STATUS_CHOICES = (
        ('draft', 'Draft'),
        ('scheduled', 'Scheduled'),
        ('running', 'Running'),
        ('completed', 'Completed'),
    )

    name = models.CharField(max_length=200)
    target_department = models.ForeignKey(
        Department, on_delete=models.PROTECT, related_name='phishing_campaigns',
        blank=True, null=True,
    )
    target_ou = models.CharField(max_length=150, blank=True, help_text="Legacy AD OU label")
    email_subject = models.CharField(max_length=255)
    email_template_body = models.TextField()
    scheduled_date = models.DateTimeField(blank=True, null=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='draft')
    
    # إحصائيات عامة للحملة دون التشهير بهوية الموظفين
    total_sent = models.PositiveIntegerField(default=0)
    total_reported = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.name} ({self.target_department or self.target_ou or 'All departments'})"


class PhishingReport(models.Model):
    """
    جدول بلاغات الإيميلات المشبوهة المستلمة عبر n8n لعرضها في الداشبورد.
    ملاحظة أمنية: لا يحتوي هذا الجدول على أي علاقة بجدول User لضمان إخفاء هوية الموظف المبلغ.
    """
    ANALYSIS_STATUS_CHOICES = (
        ('pending', 'Pending Analysis'),
        ('queued_sandbox', 'Routed to Kali Sandbox'),
        ('safe_simulation', 'Verified Phishing Simulation'),
        ('malicious', 'Confirmed Malicious Threat'),
        ('false_positive', 'Safe / False Positive'),
    )

    # 1. بيانات الإيميل الأساسية التي ستظهر في جدول الداشبورد
    sender_email = models.CharField(max_length=255, help_text="Suspicious email sender address")
    email_subject = models.CharField(max_length=255, blank=True, null=True)
    email_body = models.TextField(help_text="Extracted text/HTML content of the suspicious email")
    email_date = models.DateTimeField(help_text="Original timestamp when the email was sent/received")

    # 2. الإيميل نفسه (ملف .eml الخام أو headers كاملة)
    raw_email_file = models.FileField(
        upload_to='reported_emails/%Y/%m/', 
        blank=True, 
        null=True,
        help_text="Original .eml file captured for Kali Sandbox inspection"
    )
    raw_headers = models.TextField(blank=True, null=True, help_text="Full email headers for technical inspection")

    # 3. بيانات إحصائية وتنظيمية (بدون كشف اسم الموظف)
    reporter_ou = models.CharField(
        max_length=150, 
        blank=True, 
        null=True, 
        help_text="Anonymous department/OU tag for statistical metrics only"
    )
    analysis_status = models.CharField(max_length=25, choices=ANALYSIS_STATUS_CHOICES, default='pending')
    analyst_notes = models.TextField(blank=True, null=True)
    reported_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-reported_at'] # عرض أحدث البلاغات في أعلى الداشبورد دائماً

    def __str__(self):
        return f"Suspicious Email from {self.sender_email} on {self.email_date.strftime('%Y-%m-%d %H:%M')}"


class CampaignMetrics(models.Model):
    """Aggregated campaign counters. Deliberately contains no user identifier."""
    campaign = models.ForeignKey(PhishingCampaign, on_delete=models.CASCADE, related_name='metrics')
    department = models.ForeignKey(Department, on_delete=models.PROTECT, related_name='campaign_metrics')
    total_sent = models.PositiveIntegerField(default=0)
    total_opened = models.PositiveIntegerField(default=0)
    total_clicked = models.PositiveIntegerField(default=0)
    total_reported = models.PositiveIntegerField(default=0)
    simulated_sent = models.PositiveIntegerField(default=0)
    simulated_opened = models.PositiveIntegerField(default=0)
    simulated_clicked = models.PositiveIntegerField(default=0)
    simulated_reported = models.PositiveIntegerField(default=0)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=['campaign', 'department'], name='unique_campaign_department_metrics')]

    def __str__(self):
        return f"{self.campaign} — {self.department}"


class CampaignTrackingToken(models.Model):
    """Anonymous per-message token; recipient identity and email are never stored."""
    campaign = models.ForeignKey(PhishingCampaign, on_delete=models.CASCADE, related_name='tracking_tokens')
    department = models.ForeignKey(Department, on_delete=models.PROTECT, related_name='campaign_tracking_tokens')
    employee = models.ForeignKey(
        'accounts.User', on_delete=models.SET_NULL, blank=True, null=True,
        related_name='campaign_tracking_tokens',
    )
    token_hash = models.CharField(max_length=64, unique=True)
    clicked_at = models.DateTimeField(blank=True, null=True)
    reported_at = models.DateTimeField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"Campaign interaction ({self.campaign_id})"


from django.db import models

class ScanReport(models.Model):
    target = models.CharField(max_length=255)
    scan_type = models.CharField(max_length=50)  # مثل: scanner أو deep_recon
    output_data = models.TextField()             # نتيجة الفحص أو التقرير
    status = models.CharField(max_length=20, default='SUCCESS')
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.target} - {self.scan_type}"

from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    N8nPhishingWebhookView,
    DashboardPhishingReportViewSet,
    PhishingCampaignViewSet,
    CampaignMetricsViewSet,
    campaign_click,
    get_scan_reports,
    run_tool_scan
)

router = DefaultRouter()
router.register(r'reports', DashboardPhishingReportViewSet, basename='phishing-reports')
router.register(r'campaigns', PhishingCampaignViewSet, basename='phishing-campaigns')
router.register(r'campaign-metrics', CampaignMetricsViewSet, basename='campaign-metrics')

urlpatterns = [
    path('webhook/n8n-report/', N8nPhishingWebhookView.as_view(), name='n8n-phishing-webhook'),
    path('campaigns/click/<str:token>/', campaign_click, name='campaign-click'),
    path('scan-reports/', get_scan_reports, name='scan-reports'),
    path('run-scan/', run_tool_scan, name='run-tool-scan'),
    path('', include(router.urls)),
]












# $WebhookURL = "http://localhost:5678/webhook-test/report-suspicious-email"
# $Payload = @{
#     sender_email = "employee@lab.local"
#     email_subject = "FW: Urgent: Reset Your Password"
#     email_body = "مرحباً فريق الأمن، وصلني هذا الإيميل المشبوه ويطلب مني الدخول على http://evil-login.com"
#     raw_headers = "MIME-Version: 1.0`nReceived-SPF: SoftFail"
#     email_date = "2026-11-04T10:00:00Z"
#     reporter_ou = "Finance_Dept"
# } | ConvertTo-Json

# Invoke-RestMethod -Uri $WebhookURL -Method Post -Body $Payload -ContentType "application/json"

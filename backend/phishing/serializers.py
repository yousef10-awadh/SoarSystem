from rest_framework import serializers
from accounts.models import Department
from .models import CampaignMetrics, PhishingCampaign, PhishingReport, ScanReport

class PhishingCampaignSerializer(serializers.ModelSerializer):
    target_department_name = serializers.CharField(write_only=True, required=False, allow_blank=True)
    department_name = serializers.CharField(source='target_department.name', read_only=True)

    class Meta:
        model = PhishingCampaign
        fields = ['id', 'name', 'target_department', 'target_department_name', 'department_name', 'target_ou', 'email_subject', 'email_template_body', 'scheduled_date', 'status', 'total_sent', 'total_reported', 'created_at']
        read_only_fields = ['id', 'total_sent', 'total_reported', 'created_at']

    def create(self, validated_data):
        department_name = validated_data.pop('target_department_name', '').strip()
        if department_name and not validated_data.get('target_department'):
            department, _ = Department.objects.get_or_create(name=department_name)
            validated_data['target_department'] = department
        campaign = super().create(validated_data)
        if campaign.target_department:
            CampaignMetrics.objects.get_or_create(campaign=campaign, department=campaign.target_department)
        return campaign

    def update(self, instance, validated_data):
        department_name = validated_data.pop('target_department_name', '').strip()
        if department_name:
            department, _ = Department.objects.get_or_create(name=department_name)
            validated_data['target_department'] = department
        campaign = super().update(instance, validated_data)
        if campaign.target_department:
            CampaignMetrics.objects.get_or_create(campaign=campaign, department=campaign.target_department)
        return campaign


class CampaignMetricsSerializer(serializers.ModelSerializer):
    """Exposes only department-level counters; the schema has no employee reference."""
    department_name = serializers.ReadOnlyField(source='department.name')

    class Meta:
        model = CampaignMetrics
        fields = ['id', 'campaign', 'department', 'department_name', 'total_sent', 'total_clicked', 'total_reported', 'updated_at']
        read_only_fields = fields


class PhishingReportSerializer(serializers.ModelSerializer):
    """
    مسؤول عن تحويل بيانات الإيميل المشبوه (المرسل، المحتوى، التاريخ، والملف الأصلي)
    لعرضها في جدول الداشبورد بدون أي إشارة لهوية الموظف المُبلّغ.
    """
    class Meta:
        model = PhishingReport
        fields = [
            'id',
            'sender_email',
            'email_subject',
            'email_body',
            'email_date',
            'raw_email_file',
            'raw_headers',
            'reporter_ou',
            'analysis_status',
            'analyst_notes',
            'reported_at',
        ]
        read_only_fields = ['id', 'reported_at']


class ScanReportSerializer(serializers.ModelSerializer):
    class Meta:
        model = ScanReport
        fields = '__all__'

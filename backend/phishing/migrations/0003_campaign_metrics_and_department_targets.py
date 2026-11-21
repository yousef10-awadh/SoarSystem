from django.db import migrations, models
import django.db.models.deletion


def link_campaign_departments(apps, schema_editor):
    Department = apps.get_model('accounts', 'Department')
    Campaign = apps.get_model('phishing', 'PhishingCampaign')
    database = schema_editor.connection.alias
    for campaign in Campaign.objects.using(database).exclude(target_ou='').iterator():
        department, _ = Department.objects.using(database).get_or_create(name=campaign.target_ou)
        campaign.target_department_id = department.pk
        campaign.save(using=database, update_fields=['target_department'])


class Migration(migrations.Migration):
    dependencies = [
        ('accounts', '0002_department_user_department'),
        ('phishing', '0002_scanreport'),
    ]

    operations = [
        migrations.AddField(
            model_name='phishingcampaign', name='scheduled_date',
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='phishingcampaign', name='target_department',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, related_name='phishing_campaigns', to='accounts.department'),
        ),
        migrations.AlterField(
            model_name='phishingcampaign', name='target_ou',
            field=models.CharField(blank=True, help_text='Legacy AD OU label', max_length=150),
        ),
        migrations.RunPython(link_campaign_departments, migrations.RunPython.noop),
        migrations.CreateModel(
            name='CampaignMetrics',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('total_sent', models.PositiveIntegerField(default=0)),
                ('total_opened', models.PositiveIntegerField(default=0)),
                ('total_clicked', models.PositiveIntegerField(default=0)),
                ('total_reported', models.PositiveIntegerField(default=0)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('campaign', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='metrics', to='phishing.phishingcampaign')),
                ('department', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='campaign_metrics', to='accounts.department')),
            ],
        ),
        migrations.AddConstraint(
            model_name='campaignmetrics',
            constraint=models.UniqueConstraint(fields=('campaign', 'department'), name='unique_campaign_department_metrics'),
        ),
    ]

import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ('accounts', '0002_department_user_department'),
        ('phishing', '0004_campaignmetrics_simulated_counters'),
    ]

    operations = [
        migrations.CreateModel(
            name='CampaignTrackingToken',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('token_hash', models.CharField(max_length=64, unique=True)),
                ('clicked_at', models.DateTimeField(blank=True, null=True)),
                ('reported_at', models.DateTimeField(blank=True, null=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('campaign', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='tracking_tokens', to='phishing.phishingcampaign')),
                ('department', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='campaign_tracking_tokens', to='accounts.department')),
            ],
        ),
    ]

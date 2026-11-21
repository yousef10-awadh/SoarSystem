from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [('phishing', '0003_campaign_metrics_and_department_targets')]

    operations = [
        migrations.AddField('campaignmetrics', 'simulated_sent', models.PositiveIntegerField(default=0)),
        migrations.AddField('campaignmetrics', 'simulated_opened', models.PositiveIntegerField(default=0)),
        migrations.AddField('campaignmetrics', 'simulated_clicked', models.PositiveIntegerField(default=0)),
        migrations.AddField('campaignmetrics', 'simulated_reported', models.PositiveIntegerField(default=0)),
    ]

from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ('phishing', '0006_campaigntrackingtoken_employee'),
        ('training', '0005_course_estimated_minutes'),
    ]

    operations = [
        migrations.AddField(
            model_name='phishingsimulationresult',
            name='campaign_tracking_hash',
            field=models.CharField(blank=True, max_length=64, null=True, unique=True),
        ),
    ]

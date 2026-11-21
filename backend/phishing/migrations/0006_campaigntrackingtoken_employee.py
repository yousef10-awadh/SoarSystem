import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ('accounts', '0002_department_user_department'),
        ('phishing', '0005_campaign_tracking_token'),
    ]

    operations = [
        migrations.AddField(
            model_name='campaigntrackingtoken',
            name='employee',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='campaign_tracking_tokens',
                to='accounts.user',
            ),
        ),
    ]

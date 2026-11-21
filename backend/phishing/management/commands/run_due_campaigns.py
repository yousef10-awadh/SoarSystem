from django.core.management.base import BaseCommand
from django.utils import timezone

from phishing.models import PhishingCampaign
from phishing.views import (
    _campaign_delivery_error,
    _campaign_recipients,
    _send_campaign_to_recipients,
)


class Command(BaseCommand):
    help = 'Send due, explicitly scheduled phishing-awareness campaigns.'

    def handle(self, *args, **options):
        delivery_error = _campaign_delivery_error()
        if delivery_error:
            self.stderr.write(self.style.ERROR(delivery_error))
            return

        due_campaigns = PhishingCampaign.objects.filter(
            status='scheduled',
            scheduled_date__lte=timezone.now(),
        ).select_related('target_department')

        for campaign in due_campaigns:
            recipients, error = _campaign_recipients(campaign)
            if error:
                self.stderr.write(self.style.ERROR(f'{campaign.name}: {error}'))
                continue

            sent, failed = _send_campaign_to_recipients(campaign, recipients)
            if sent:
                self.stdout.write(self.style.SUCCESS(
                    f'{campaign.name}: sent={sent}, failed={failed}'
                ))
            else:
                self.stderr.write(self.style.ERROR(
                    f'{campaign.name}: no messages sent; check Django SMTP logs.'
                ))

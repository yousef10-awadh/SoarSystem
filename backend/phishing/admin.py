from django.contrib import admin
from .models import CampaignMetrics, PhishingCampaign, PhishingReport
admin.site.register(PhishingCampaign)
admin.site.register(PhishingReport)
admin.site.register(CampaignMetrics)

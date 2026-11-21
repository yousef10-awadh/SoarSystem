from django.contrib import admin
from .models import Course, CourseCertificate, CourseQuestion, PhishingSimulationResult, TrainingProgress


class CourseQuestionInline(admin.TabularInline):
    model = CourseQuestion
    extra = 1


class CourseAdmin(admin.ModelAdmin):
    list_display = ('title', 'target_ou', 'passing_score', 'estimated_minutes', 'is_active')
    list_filter = ('is_active', 'target_ou')
    inlines = [CourseQuestionInline]


admin.site.register(Course, CourseAdmin)
admin.site.register(CourseQuestion)
admin.site.register(TrainingProgress)
admin.site.register(PhishingSimulationResult)
admin.site.register(CourseCertificate)

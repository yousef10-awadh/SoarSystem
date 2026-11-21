from django.db import models
from django.conf import settings

class Course(models.Model):
    title = models.CharField(max_length=200)
    description = models.TextField()
    passing_score = models.PositiveSmallIntegerField(default=70)
    estimated_minutes = models.PositiveSmallIntegerField(default=15)
    
    # مسار ملف البداية لدورة SCORM أو مستودع GitHub (مثلاً: courses/phishing_101/index.html)
    launch_path = models.CharField(
        max_length=255, 
        help_text="Relative path inside media/ folder to launch inside sandboxed iframe"
    )
    target_ou = models.CharField(
        max_length=150, 
        blank=True, 
        null=True, 
        help_text="Target AD Organizational Unit (leave blank for all employees)"
    )
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.title


class CourseQuestion(models.Model):
    course = models.ForeignKey(Course, on_delete=models.CASCADE, related_name='questions')
    prompt = models.CharField(max_length=500)
    option_a = models.CharField(max_length=255)
    option_b = models.CharField(max_length=255)
    option_c = models.CharField(max_length=255)
    option_d = models.CharField(max_length=255)
    correct_option = models.CharField(max_length=1, choices=[('a', 'A'), ('b', 'B'), ('c', 'C'), ('d', 'D')])
    order = models.PositiveSmallIntegerField(default=0)

    class Meta:
        ordering = ['order', 'id']

    def __str__(self):
        return self.prompt[:80]


class TrainingProgress(models.Model):
    STATUS_CHOICES = (
        ('assigned', 'Assigned'),
        ('in_progress', 'In Progress'),
        ('completed', 'Completed'),
    )

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, 
        on_delete=models.CASCADE, 
        related_name='training_records'
    )
    course = models.ForeignKey(
        Course, 
        on_delete=models.CASCADE, 
        related_name='enrollments'
    )
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='assigned')
    score = models.PositiveIntegerField(default=0, help_text="Score percentage (0-100)")
    completed_at = models.DateTimeField(blank=True, null=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=['user', 'course'], name='unique_user_course_progress')]

    def __str__(self):
        return f"{self.user.username} - {self.course.title} ({self.status})"


class PhishingSimulationResult(models.Model):
    RESULT_CHOICES = (
        ('reported', 'Reported'),
        ('clicked', 'Clicked'),
    )

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='simulation_results')
    subject = models.CharField(max_length=255)
    result = models.CharField(max_length=20, choices=RESULT_CHOICES)
    note = models.TextField(blank=True)
    campaign_tracking_hash = models.CharField(max_length=64, blank=True, null=True, unique=True)
    occurred_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-occurred_at']

    def __str__(self):
        return f"{self.user.username} - {self.subject} ({self.result})"


class CourseCertificate(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='course_certificates')
    course = models.ForeignKey(Course, on_delete=models.PROTECT, related_name='certificates')
    score = models.PositiveSmallIntegerField()
    certificate_code = models.CharField(max_length=32, unique=True)
    issued_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-issued_at']
        constraints = [models.UniqueConstraint(fields=['user', 'course'], name='unique_user_course_certificate')]

    def __str__(self):
        return f"{self.course.title} - {self.certificate_code}"

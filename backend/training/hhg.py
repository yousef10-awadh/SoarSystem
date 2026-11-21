from django.db import models
from django.conf import settings

class Course(models.Model):
    title = models.CharField(max_length=200)
    description = models.TextField()
    
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
        unique_together = ('user', 'course') # منع تكرار تسجيل نفس الدورة لنفس الموظف

    def __str__(self):
        return f"{self.user.username} - {self.course.title} ({self.status})"

    

    ////////////////////////////////////////////////////////////////////////////////////////
from rest_framework import serializers
from .models import Course, TrainingProgress

class CourseSerializer(serializers.ModelSerializer):
    is_completed = serializers.SerializerMethodField()

    class Meta:
        model = Course
        fields = ['id', 'title', 'description', 'launch_path', 'target_ou', 'is_active', 'is_completed']

    def get_is_completed(self, obj):
        request = self.context.get('request')
        if request and request.user.is_authenticated:
            return TrainingProgress.objects.filter(
                user=request.user, course=obj, status='completed'
            ).exists()
        return False


class TrainingProgressSerializer(serializers.ModelSerializer):
    course_title = serializers.ReadOnlyField(source='course.title')

    class Meta:
        model = TrainingProgress
        fields = ['id', 'user', 'course', 'course_title', 'status', 'score', 'completed_at', 'updated_at']
        read_only_fields = ['user', 'completed_at', 'updated_at']


//////////////////////////////////////////////////////////////////////
from django.utils import timezone
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from .models import Course, TrainingProgress
from .serializers import CourseSerializer, TrainingProgressSerializer

class CourseViewSet(viewsets.ModelViewSet):
    queryset = Course.objects.filter(is_active=True)
    serializer_class = CourseSerializer
    permission_classes = [IsAuthenticated]

    @action(detail=True, methods=['post'])
    def complete(self, request, pk=None):
        """تسجيل إتمام الموظف للدورة التدريبية"""
        course = self.get_object()
        progress, created = TrainingProgress.objects.get_or_create(
            user=request.user,
            course=course
        )
        progress.status = 'completed'
        progress.score = request.data.get('score', 100)
        progress.completed_at = timezone.now()
        progress.save()

        return Response({
            "status": "success",
            "message": f"تم تسجيل اجتياز دورة {course.title} بنجاح."
        }, status=status.HTTP_200_OK)


class TrainingProgressViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = TrainingProgressSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return TrainingProgress.objects.filter(user=self.request.user)
    

///////////////////////////////////////////////////

from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import CourseViewSet, TrainingProgressViewSet

router = DefaultRouter()
router.register(r'courses', CourseViewSet, basename='courses')
router.register(r'progress', TrainingProgressViewSet, basename='training-progress')

urlpatterns = [
    path('', include(router.urls)),
]
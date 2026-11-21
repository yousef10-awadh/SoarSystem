from rest_framework import serializers
from django.conf import settings
from django.utils.text import slugify
from pathlib import Path
from .models import Course, CourseCertificate, CourseQuestion, PhishingSimulationResult, TrainingProgress


class CourseQuestionAdminSerializer(serializers.ModelSerializer):
    class Meta:
        model = CourseQuestion
        fields = ['id', 'prompt', 'option_a', 'option_b', 'option_c', 'option_d', 'correct_option', 'order']
        read_only_fields = ['id']


def is_training_manager_user(user):
    return user.is_staff or user.role in {'admin', 'analyst', 'trainer'}


def make_course_launch_path(title):
    slug = slugify(title, allow_unicode=True) or 'course'
    return f'courses/{slug}/index.html'


class CourseSerializer(serializers.ModelSerializer):
    is_completed = serializers.SerializerMethodField()
    progress_status = serializers.SerializerMethodField()
    score = serializers.SerializerMethodField()
    content_available = serializers.SerializerMethodField()
    questions = CourseQuestionAdminSerializer(many=True, required=False)
    launch_path = serializers.CharField(required=False, allow_blank=True, allow_null=True)

    def validate(self, attrs):
        if not attrs.get('launch_path'):
            attrs['launch_path'] = make_course_launch_path(attrs.get('title') or getattr(self.instance, 'title', 'course'))
        return attrs

    class Meta:
        model = Course
        fields = ['id', 'title', 'description', 'passing_score', 'estimated_minutes', 'launch_path', 'content_available', 'target_ou', 'is_active', 'is_completed', 'progress_status', 'score', 'questions']

    def to_representation(self, instance):
        data = super().to_representation(instance)
        request = self.context.get('request')
        if request and not is_training_manager_user(request.user):
            for question in data.get('questions', []):
                question.pop('correct_option', None)
        return data

    def create(self, validated_data):
        questions_data = validated_data.pop('questions', [])
        course = Course.objects.create(**validated_data)
        for question in questions_data:
            CourseQuestion.objects.create(course=course, **question)
        return course

    def update(self, instance, validated_data):
        questions_data = validated_data.pop('questions', None)
        for field, value in validated_data.items():
            setattr(instance, field, value)
        instance.save()
        if questions_data is not None:
            instance.questions.all().delete()
            for question in questions_data:
                CourseQuestion.objects.create(course=instance, **question)
        return instance

    def get_is_completed(self, obj):
        request = self.context.get('request')
        if request and request.user.is_authenticated:
            return TrainingProgress.objects.filter(
                user=request.user, course=obj, status='completed'
            ).exists()
        return False

    def get_progress_status(self, obj):
        request = self.context.get('request')
        if request and request.user.is_authenticated:
            progress = TrainingProgress.objects.filter(user=request.user, course=obj).first()
            return progress.status if progress else 'assigned'
        return 'assigned'

    def get_score(self, obj):
        request = self.context.get('request')
        if request and request.user.is_authenticated:
            progress = TrainingProgress.objects.filter(user=request.user, course=obj).first()
            return progress.score if progress else 0
        return 0

    def get_content_available(self, obj):
        launch_path = (obj.launch_path or '').strip()
        if launch_path.startswith(('https://', 'http://')):
            return True
        media_root = Path(settings.MEDIA_ROOT).resolve()
        content_path = (media_root / launch_path.lstrip('/\\')).resolve()
        if content_path != media_root and media_root not in content_path.parents:
            return False
        return content_path.is_file()


class TrainingProgressSerializer(serializers.ModelSerializer):
    course_title = serializers.ReadOnlyField(source='course.title')

    class Meta:
        model = TrainingProgress
        fields = ['id', 'user', 'course', 'course_title', 'status', 'score', 'completed_at', 'updated_at']
        read_only_fields = ['user', 'completed_at', 'updated_at']


class PhishingSimulationResultSerializer(serializers.ModelSerializer):
    result_label = serializers.CharField(source='get_result_display', read_only=True)

    class Meta:
        model = PhishingSimulationResult
        fields = ['id', 'subject', 'result', 'result_label', 'note', 'occurred_at']
        read_only_fields = fields


class CourseCertificateSerializer(serializers.ModelSerializer):
    course_title = serializers.ReadOnlyField(source='course.title')

    class Meta:
        model = CourseCertificate
        fields = ['id', 'course', 'course_title', 'score', 'certificate_code', 'issued_at']
        read_only_fields = fields


class CourseQuestionSerializer(serializers.ModelSerializer):
    class Meta:
        model = CourseQuestion
        fields = ['id', 'prompt', 'option_a', 'option_b', 'option_c', 'option_d']


from django.utils import timezone
from uuid import uuid4
from rest_framework import viewsets, status
from rest_framework.exceptions import PermissionDenied
from django.db import models
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from .models import Course, CourseCertificate, CourseQuestion, PhishingSimulationResult, TrainingProgress
from .serializers import CourseCertificateSerializer, CourseQuestionAdminSerializer, CourseQuestionSerializer, CourseSerializer, PhishingSimulationResultSerializer, TrainingProgressSerializer


def is_training_manager(user):
    return user.is_staff or user.role in {'admin', 'analyst', 'trainer'}


class CourseViewSet(viewsets.ModelViewSet):
    queryset = Course.objects.filter(is_active=True)
    serializer_class = CourseSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        if is_training_manager(self.request.user):
            return Course.objects.all()
        queryset = Course.objects.filter(is_active=True)
        department = getattr(self.request.user, 'department', None)
        if department:
            return queryset.filter(models.Q(target_ou__isnull=True) | models.Q(target_ou='') | models.Q(target_ou=department.name))
        return queryset.filter(models.Q(target_ou__isnull=True) | models.Q(target_ou=''))

    def perform_create(self, serializer):
        if not is_training_manager(self.request.user):
            raise PermissionDenied('Only trainers and administrators can manage courses.')
        serializer.save()

    @action(detail=True, methods=['post'])
    def start(self, request, pk=None):
        course = self.get_object()
        progress, _ = TrainingProgress.objects.get_or_create(user=request.user, course=course)
        if progress.status != 'completed':
            progress.status = 'in_progress'
            progress.save(update_fields=['status', 'updated_at'])
        return Response(TrainingProgressSerializer(progress).data, status=status.HTTP_200_OK)

    @action(detail=True, methods=['post'])
    def submit_quiz(self, request, pk=None):
        course = self.get_object()
        questions = list(course.questions.all())
        if not questions:
            return Response({'error': 'هذه الدورة لا تحتوي على اختبار بعد.'}, status=status.HTTP_400_BAD_REQUEST)
        answers = request.data.get('answers')
        if not isinstance(answers, dict):
            return Response({'error': 'الإجابات المرسلة غير صحيحة.'}, status=status.HTTP_400_BAD_REQUEST)
        correct_count = sum(1 for question in questions if str(answers.get(str(question.id), '')).lower() == question.correct_option)
        score = round(correct_count * 100 / len(questions))
        progress, _ = TrainingProgress.objects.get_or_create(user=request.user, course=course)
        progress.score = score
        progress.status = 'completed' if score >= course.passing_score else 'in_progress'
        progress.completed_at = timezone.now() if progress.status == 'completed' else None
        progress.save()
        if progress.status == 'completed':
            CourseCertificate.objects.get_or_create(
                user=request.user,
                course=course,
                defaults={'score': score, 'certificate_code': uuid4().hex[:16].upper()},
            )
        return Response({
            'score': score,
            'passed': progress.status == 'completed',
            'passing_score': course.passing_score,
            'correct_answers': correct_count,
            'total_questions': len(questions),
        })

    def update(self, request, *args, **kwargs):
        if not is_training_manager(request.user):
            raise PermissionDenied('Only trainers and administrators can manage courses.')
        return super().update(request, *args, **kwargs)

    def create(self, request, *args, **kwargs):
        if not is_training_manager(request.user):
            raise PermissionDenied('Only trainers and administrators can manage courses.')
        return super().create(request, *args, **kwargs)

    def partial_update(self, request, *args, **kwargs):
        if not is_training_manager(request.user):
            raise PermissionDenied('Only trainers and administrators can manage courses.')
        return super().partial_update(request, *args, **kwargs)

    def destroy(self, request, *args, **kwargs):
        if not is_training_manager(request.user):
            raise PermissionDenied('Only trainers and administrators can manage courses.')
        return super().destroy(request, *args, **kwargs)

    @action(detail=True, methods=['post'])
    def complete(self, request, pk=None):
        return Response(
            {'error': 'أرسل إجابات الاختبار عبر submit_quiz لتسجيل النتيجة.'},
            status=status.HTTP_410_GONE,
        )


class TrainingProgressViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = TrainingProgressSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        queryset = TrainingProgress.objects.select_related('user', 'course')
        if self.request.user.is_staff or self.request.user.role in {'analyst', 'admin', 'trainer'}:
            return queryset
        return queryset.filter(user=self.request.user)


class PhishingSimulationResultViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = PhishingSimulationResultSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return PhishingSimulationResult.objects.filter(user=self.request.user)


class CourseCertificateViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = CourseCertificateSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return CourseCertificate.objects.filter(user=self.request.user).select_related('course')


class CourseQuestionViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    queryset = CourseQuestion.objects.select_related('course').all()

    def get_serializer_class(self):
        if is_training_manager(self.request.user):
            return CourseQuestionAdminSerializer
        return CourseQuestionSerializer

    def get_queryset(self):
        queryset = super().get_queryset()
        if is_training_manager(self.request.user):
            return queryset
        department = getattr(self.request.user, 'department', None)
        visible_courses = Course.objects.filter(is_active=True)
        if department:
            visible_courses = visible_courses.filter(models.Q(target_ou__isnull=True) | models.Q(target_ou='') | models.Q(target_ou=department.name))
        else:
            visible_courses = visible_courses.filter(models.Q(target_ou__isnull=True) | models.Q(target_ou=''))
        return queryset.filter(course__in=visible_courses)

    def create(self, request, *args, **kwargs):
        if not is_training_manager(request.user):
            raise PermissionDenied('Only training managers can edit quiz questions.')
        return super().create(request, *args, **kwargs)

    def update(self, request, *args, **kwargs):
        if not is_training_manager(request.user):
            raise PermissionDenied('Only training managers can edit quiz questions.')
        return super().update(request, *args, **kwargs)

    def partial_update(self, request, *args, **kwargs):
        if not is_training_manager(request.user):
            raise PermissionDenied('Only training managers can edit quiz questions.')
        return super().partial_update(request, *args, **kwargs)

    def destroy(self, request, *args, **kwargs):
        if not is_training_manager(request.user):
            raise PermissionDenied('Only training managers can edit quiz questions.')
        return super().destroy(request, *args, **kwargs)

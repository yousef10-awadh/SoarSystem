from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import CourseCertificateViewSet, CourseQuestionViewSet, CourseViewSet, PhishingSimulationResultViewSet, TrainingProgressViewSet

router = DefaultRouter()
router.register(r'courses', CourseViewSet, basename='courses')
router.register(r'progress', TrainingProgressViewSet, basename='training-progress')
router.register(r'simulations', PhishingSimulationResultViewSet, basename='training-simulations')
router.register(r'certificates', CourseCertificateViewSet, basename='training-certificates')
router.register(r'questions', CourseQuestionViewSet, basename='training-questions')

urlpatterns = [
    path('', include(router.urls)),
]

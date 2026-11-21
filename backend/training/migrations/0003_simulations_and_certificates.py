from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('training', '0002_course_passing_score'),
    ]

    operations = [
        migrations.CreateModel(
            name='PhishingSimulationResult',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('subject', models.CharField(max_length=255)),
                ('result', models.CharField(choices=[('reported', 'Reported'), ('clicked', 'Clicked')], max_length=20)),
                ('note', models.TextField(blank=True)),
                ('occurred_at', models.DateTimeField(auto_now_add=True)),
                ('user', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='simulation_results', to=settings.AUTH_USER_MODEL)),
            ],
            options={'ordering': ['-occurred_at']},
        ),
        migrations.CreateModel(
            name='CourseCertificate',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('score', models.PositiveSmallIntegerField()),
                ('certificate_code', models.CharField(max_length=32, unique=True)),
                ('issued_at', models.DateTimeField(auto_now_add=True)),
                ('course', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='certificates', to='training.course')),
                ('user', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='course_certificates', to=settings.AUTH_USER_MODEL)),
            ],
            options={'ordering': ['-issued_at']},
        ),
        migrations.AddConstraint(
            model_name='coursecertificate',
            constraint=models.UniqueConstraint(fields=('user', 'course'), name='unique_user_course_certificate'),
        ),
    ]

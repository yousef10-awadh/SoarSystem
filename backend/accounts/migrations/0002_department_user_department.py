from django.db import migrations, models
import django.db.models.deletion


def create_departments_and_link_users(apps, schema_editor):
    Department = apps.get_model('accounts', 'Department')
    User = apps.get_model('accounts', 'User')
    database = schema_editor.connection.alias
    for user in User.objects.using(database).exclude(department_ou__isnull=True).exclude(department_ou='').iterator():
        department, _ = Department.objects.using(database).get_or_create(name=user.department_ou)
        user.department_id = department.pk
        user.save(using=database, update_fields=['department'])


class Migration(migrations.Migration):
    dependencies = [('accounts', '0001_initial')]

    operations = [
        migrations.CreateModel(
            name='Department',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('name', models.CharField(max_length=150, unique=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
            ],
            options={'ordering': ['name']},
        ),
        migrations.AddField(
            model_name='user',
            name='department',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='users', to='accounts.department'),
        ),
        migrations.RunPython(create_departments_and_link_users, migrations.RunPython.noop),
    ]

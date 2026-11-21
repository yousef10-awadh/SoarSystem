from django.db import migrations, models


def add_estimated_minutes_if_missing(apps, schema_editor):
    Course = apps.get_model('training', 'Course')
    table_name = Course._meta.db_table
    column_name = 'estimated_minutes'
    with schema_editor.connection.cursor() as cursor:
        existing_columns = {
            column.name
            for column in schema_editor.connection.introspection.get_table_description(cursor, table_name)
        }
    if column_name not in existing_columns:
        schema_editor.add_field(
            Course,
            Course._meta.get_field(column_name),
        )


class Migration(migrations.Migration):
    dependencies = [('training', '0004_course_estimated_minutes_questions')]
    operations = [
        migrations.SeparateDatabaseAndState(
            database_operations=[
                migrations.RunPython(
                    add_estimated_minutes_if_missing,
                    migrations.RunPython.noop,
                ),
            ],
            state_operations=[
                migrations.AddField(
                    model_name='course',
                    name='estimated_minutes',
                    field=models.PositiveSmallIntegerField(default=15),
                ),
            ],
        ),
    ]

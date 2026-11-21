from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand


class Command(BaseCommand):
    help = 'Create or update local demo administrator and employee accounts.'

    def handle(self, *args, **options):
        User = get_user_model()
        accounts = [
            {
                'username': 'demo_admin',
                'password': 'MirsadAdmin2026!',
                'role': 'admin',
                'is_staff': True,
                'is_superuser': True,
                'first_name': 'Demo Admin',
            },
            {
                'username': 'demo_employee',
                'password': 'MirsadEmployee2026!',
                'role': 'employee',
                'is_staff': False,
                'is_superuser': False,
                'first_name': 'Demo Employee',
            },
        ]

        for account in accounts:
            password = account.pop('password')
            user, created = User.objects.get_or_create(username=account['username'])
            for field, value in account.items():
                setattr(user, field, value)
            user.set_password(password)
            user.save()
            state = 'Created' if created else 'Updated'
            self.stdout.write(self.style.SUCCESS(f'{state} {user.username} ({user.role})'))

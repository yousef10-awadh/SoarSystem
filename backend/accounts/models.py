from django.contrib.auth.models import AbstractUser
from django.db import models


class Department(models.Model):
    """Organizational unit synchronized from Active Directory."""
    name = models.CharField(max_length=150, unique=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['name']

    def __str__(self):
        return self.name


class User(AbstractUser):
    ROLE_CHOICES = (
        ('employee', 'Employee'),
        ('trainer', 'Trainer'),
        ('analyst', 'Security Analyst'),
        ('admin', 'System Admin'),
    )

    # بيانات قادمة من Active Directory (LAB.local)
    department_ou = models.CharField(
        max_length=150, 
        blank=True, 
        null=True, 
        help_text="Organizational Unit (OU) synced from Active Directory"
    )
    department = models.ForeignKey(
        Department,
        on_delete=models.SET_NULL,
        related_name='users',
        blank=True,
        null=True,
    )
    ad_distinguished_name = models.CharField(
        max_length=255, 
        blank=True, 
        null=True,
        help_text="Full LDAP Distinguished Name (DN)"
    )
    
    # صلاحية المستخدم داخل المنصة
    role = models.CharField(max_length=20, choices=ROLE_CHOICES, default='employee')

    def __str__(self):
        return f"{self.username} ({self.get_role_display()} - {self.department_ou or 'No OU'})"

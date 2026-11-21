import os
import re
from django.contrib.auth.backends import BaseBackend
from django.contrib.auth import get_user_model
from ldap3 import Server, Connection, ALL, SUBTREE
from ldap3.core.exceptions import LDAPException

User = get_user_model()

class ActiveDirectoryBackend(BaseBackend):
    """
    محرك مصادقة مخصص للربط المباشر مع خادم Active Directory (LAB.local)
    وسحب الوحدة التنظيمية (OU) للموظف تلقائياً.
    """
    def authenticate(self, request, username=None, password=None, **kwargs):
        if not username or not password:
            return None

        ldap_server_uri = os.environ.get('LDAP_SERVER_URI', 'ldap://192.168.10.10:389')
        search_base = os.environ.get('LDAP_SEARCH_BASE', 'DC=LAB,DC=local')
        domain_name = os.environ.get('LDAP_DOMAIN', 'LAB.local')

        # صيغة الدخول في Active Directory (UserPrincipalName)
        user_upn = f"{username}@{domain_name}" if '@' not in username else username
        clean_username = username.split('@')[0]

        try:
            # 1. الاتصال بخادم Active Directory والتحقق من بيانات الموظف
            server = Server(ldap_server_uri, get_info=ALL, connect_timeout=5)
            conn = Connection(server, user=user_upn, password=password, auto_bind=True)

            # 2. البحث عن تفاصيل الموظف لاستخراج الـ OU والاسم والايميل
            from ldap3.utils.conv import escape_filter_chars
            search_filter = f"(sAMAccountName={escape_filter_chars(clean_username)})"
            conn.search(
                search_base=search_base,
                search_filter=search_filter,
                search_scope=SUBTREE,
                attributes=['distinguishedName', 'givenName', 'sn', 'mail', 'department']
            )

            dn = ""
            department_ou = "General"
            first_name = ""
            last_name = ""
            email = f"{clean_username}@{domain_name}"
            ad_department = ""

            if conn.entries:
                entry = conn.entries[0]
                dn = str(entry.distinguishedName)
                
                # استخراج أول OU من مسار الـ Distinguished Name (مثلاً: OU=IT,DC=LAB,DC=local)
                ou_match = re.search(r'OU=([^,]+)', dn, re.IGNORECASE)
                if ou_match:
                    department_ou = ou_match.group(1)

                first_name = str(entry.givenName) if 'givenName' in entry and entry.givenName else ""
                last_name = str(entry.sn) if 'sn' in entry and entry.sn else ""
                if 'mail' in entry and entry.mail:
                    email = str(entry.mail)

            conn.unbind()

            # 3. مزامنة الموظف مع قاعدة بيانات PostgreSQL
            from .models import Department
            department_name = department_ou
            if ad_department:
                department_name = ad_department
            department, _ = Department.objects.get_or_create(name=department_name)

            user, created = User.objects.get_or_create(username=clean_username)
            user.first_name = first_name
            user.last_name = last_name
            user.email = email
            user.department_ou = department_ou
            user.department = department
            user.ad_distinguished_name = dn
            
            # لا نحفظ كلمة مرور الأكتيف دايركتوري في قاعدة البيانات (معيار أمني)
            user.set_unusable_password()
            user.save()

            return user

        except LDAPException:
            # إذا فشل الاتصال بـ AD أو كانت كلمة المرور خاطئة، نرفض الدخول عبر LDAP
            return None

    def get_user(self, user_id):
        try:
            return User.objects.get(pk=user_id)
        except User.DoesNotExist:
            return None

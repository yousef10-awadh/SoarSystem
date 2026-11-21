from rest_framework_simplejwt.serializers import TokenObtainPairSerializer
from rest_framework_simplejwt.views import TokenObtainPairView


class LoginTokenSerializer(TokenObtainPairSerializer):
    """Include the authenticated user's display and authorization data in login response."""

    @classmethod
    def get_token(cls, user):
        token = super().get_token(user)
        token['role'] = user.role
        token['is_staff'] = user.is_staff
        return token

    def validate(self, attrs):
        data = super().validate(attrs)
        data.update({
            'username': self.user.username,
            'first_name': self.user.first_name,
            'role': self.user.role,
            'is_staff': self.user.is_staff,
        })
        return data


class LoginTokenView(TokenObtainPairView):
    serializer_class = LoginTokenSerializer

from django import template
from django.utils.safestring import mark_safe

register = template.Library()

@register.filter(name='format_value')
def format_value(value):
    if value is None:
        return ""

    if isinstance(value, list):
        return ", ".join(str(item) for item in value)

    if isinstance(value, str):
        parts_list = [part.strip() for part in value.split(",") if part.strip()]
        return ", ".join(parts_list)

    return value
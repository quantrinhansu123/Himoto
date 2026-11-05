"""Empty vehicle thumbnail metadata for catalogue-only synthetic fixtures."""
import re
from datetime import datetime, timezone
from urllib.parse import urlparse


def thumbnail_response(path, method):
    match = re.fullmatch(r'/api/mobile/v1/record-media/vehicles/([1-9][0-9]*)/vehicle/\1/vehicle-photo', urlparse(path).path)
    if method != 'GET' or not match:
        return None
    index = int(match[1])
    return {'target': {'entity': 'vehicles', 'id': index, 'kind': 'vehicle',
                       'referenceId': index, 'revision': '1', 'referenceRevision': '1',
                       'label': f'Xe QA {index}', 'snapshot': 'a' * 64},
            'slot': 'vehicle-photo', 'label': 'Ảnh xe', 'photo': None, 'nextSlot': None,
            'observedAt': datetime.now(timezone.utc).isoformat()}

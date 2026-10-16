"""Catalog read fixture for existing contract form regression tests."""
from urllib.parse import urlparse


def contract_type_data():
    labels = [('daily', 'Thuê theo ngày'), ('monthly', 'Thuê theo tháng'), ('ownership', 'Thuê sở hữu'),
              ('monthly_3', 'Thuê 3 tháng'), ('monthly_6', 'Thuê 6 tháng'), ('monthly_12', 'Thuê 12 tháng'),
              ('rental', 'Thuê xe'), ('tour', 'Tour / phượt'), ('ownership_cd', 'Thuê sở hữu( cd)')]
    return [dict(id=key, label=label, rental_type=key, term_months=int(key.split('_')[1]) if key.startswith('monthly_') else None,
                 active=key in ['daily', 'monthly', 'ownership'], revision='1') for key, label in labels]


def mock_contract_type_read(route):
    if urlparse(route.request.url).path != '/api/auth/contract-types':
        return False
    assert route.request.method == 'GET', 'This regression fixture only allows catalog reads'
    route.fulfill(json=dict(status='success', data=contract_type_data()))
    return True

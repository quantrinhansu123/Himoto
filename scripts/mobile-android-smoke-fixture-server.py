"""Read-only native smoke overlay on a preserved synthetic checkpoint fork."""
import argparse
import importlib.util
import json
from copy import deepcopy
from pathlib import Path
from urllib.parse import parse_qs, urlparse
from lib import mobile_vehicle_workspace_fixture as base

ROOT = Path(__file__).resolve().parents[1]


def read_fixture(path):
    path = path.resolve()
    assert path.is_relative_to(ROOT / '.backups')
    data = json.loads(path.read_text(encoding='utf-8'))
    assert data['fixtureOnly'] is True
    return data


class SmokeModel:
    def __init__(self, directory, dashboard, inventory=None):
        self.directory, self.dashboard = read_fixture(directory), read_fixture(dashboard)
        self.inventory = read_fixture(inventory) if inventory else None
    def __getattr__(self, name):
        return getattr(base, name)
    def response(self, path, method, body, headers, state):
        route, params = urlparse(path).path, parse_qs(urlparse(path).query)
        token = (headers.get('Authorization') or headers.get('authorization', '')).removeprefix('Bearer ')
        if route.startswith('/api/mobile/v1/') and method != 'GET' and route != '/api/mobile/v1/session' and route != '/api/mobile/v1/drafts/customer-lookup':
            return 403, {'code': 'READ_ONLY_SMOKE', 'message': 'Bản thử này chỉ kiểm thao tác đọc; không ghi nghiệp vụ.'}, False
        if method == 'GET' and token in state['sessions']:
            if route == '/api/mobile/v1/vehicles/inventory' and self.inventory:
                search = params.get('search', [''])[0]
                key = 'plate' if search else 'branch' if params.get('store') == ['24'] else 'blocked' if params.get('availability') == ['blocked'] else 'last' if params.get('page') == ['2'] else 'first'
                return 200, deepcopy(self.inventory[key]), False
            if route == '/api/mobile/v1/battery-contracts/staff':
                people = state['staff_workspace']['profiles'].values()
                return 200, {'rows': [{'id': p['id'], 'name': p['name']} for p in people if p['status'] == 'active']}, False
            if route == '/api/mobile/v1/staff/organization':
                data = deepcopy(self.directory['organizationStore'])
                # Keep the exact SQL projection fixture for this UI smoke; it is
                # never claimed as the full underlying checkpoint staff dataset.
                return 200, data, False
            if route == '/api/mobile/v1/stores/23/contracts':
                return 200, deepcopy(self.directory['storeContracts']), False
            if route == '/api/mobile/v1/dashboard':
                report = deepcopy(self.dashboard['report'])
                report['from'], report['to'] = params['from'][0], params['to'][0]
                return 200, report, False
            if route == '/api/mobile/v1/dashboard/export':
                return 200, deepcopy(self.dashboard['exported']), False
        return base.response(path, method, body, headers, state)


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--port', type=int, required=True)
    parser.add_argument('--state-file', type=Path, required=True)
    parser.add_argument('--directory-fixture', type=Path, required=True)
    parser.add_argument('--dashboard-fixture', type=Path, required=True)
    parser.add_argument('--inventory-fixture', type=Path)
    args = parser.parse_args()
    assert 8100 <= args.port <= 8199 and args.port not in [8131, 8134]
    spec = importlib.util.spec_from_file_location('server', Path(__file__).with_name('mobile-contract-flow-fixture-server.py'))
    server = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(server)
    server.model = SmokeModel(args.directory_fixture, args.dashboard_fixture, args.inventory_fixture)
    server.serve(args.port, args.state_file)

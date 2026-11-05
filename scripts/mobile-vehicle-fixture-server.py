"""Separate, persistent vehicle demo checkpoint; never reset prior datasets."""
import argparse
import importlib.util
from pathlib import Path
from lib import mobile_vehicle_workspace_fixture as model
if __name__ == '__main__':
    parser = argparse.ArgumentParser(); parser.add_argument('--port', type=int, default=8131); parser.add_argument('--state-file', type=Path, required=True); args = parser.parse_args()
    if not 8100 <= args.port <= 8199: raise ValueError('Use a separate loopback QA port')
    spec = importlib.util.spec_from_file_location('server', Path(__file__).with_name('mobile-contract-flow-fixture-server.py')); server = importlib.util.module_from_spec(spec); spec.loader.exec_module(server)
    server.model = model; server.serve(args.port, args.state_file)

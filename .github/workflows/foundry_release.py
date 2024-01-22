import http.client
import json
import os
from pprint import pprint

with open(os.environ.get('MODULE_JSON_PATH'), 'r') as file:
    module = json.load(file)

body = {
    'id': module['id'],
    "dry-run": True,
    'release': {
        'version': module['version'],
        'manifest': module['manifest'],
        'notes': f"https://github.com/oronder/Oronder/releases/tag/{module['version']}",
        'compatibility': module['compatibility']
    }
}
pprint(body)

connection = http.client.HTTPSConnection("api.foundryvtt.com")
connection.request(
    "POST", "/_api/packages/release_version/",
    headers={
        'Content-Type': 'application/json',
        'Authorization': os.environ.get('FOUNDRY_PACKAGE_RELEASE_TOKEN')
    },
    body=json.dumps(body)
)
pprint(json.loads(connection.getresponse().read().decode()))

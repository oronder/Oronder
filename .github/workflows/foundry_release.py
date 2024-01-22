import http.client
import json
import os
from pprint import pprint

print(os.environ.get('MODULE_JSON_PATH'))
with open(os.environ.get('MODULE_JSON_PATH'), 'r') as file:
    module = json.load(file)
pprint(module)
connection = http.client.HTTPSConnection("api.foundryvtt.com")
connection.request(
    "POST", "/_api/packages/release_version/",
    headers={
        'Content-Type': 'application/json',
        'Authorization': os.environ.get('FOUNDRY_PACKAGE_RELEASE_TOKEN')
    },
    body=json.dumps({
        'id': module['id'],
        "dry-run": True,
        'release': {
            'version': module['version'],
            'manifest': module['manifest'],
            'notes': f"https://github.com/oronder/Oronder/releases/tag/{module['version']}",
            'compatibility': module['compatibility']
        }
    })
)
pprint(json.loads(connection.getresponse().read().decode()))

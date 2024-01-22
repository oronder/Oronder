import http.client
import json
import os

with open(os.environ.get('MODULE_JSON_PATH'), 'r') as file:
    module = json.load(file)

connection = http.client.HTTPSConnection("api.foundryvtt.com")
connection.request(
    "POST", "/_api/packages/release_version/",
    headers={
        'Content-Type': 'application/json',
        'Authorization': os.environ.get('FOUNDRY_PACKAGE_RELEASE_TOKEN')
    },
    body=json.dumps({
        'id': module['id'],
        'release': {
            'version': module['version'],
            'manifest': f"{os.environ.get('URL')}/releases/download/{module['version']}/module.json",
            'notes': f"{os.environ.get('URL')}/releases/tag/{module['version']}",
            'compatibility': module['compatibility']
        }
    })
)
assert json.loads(connection.getresponse().read().decode())['status'] == 'success'

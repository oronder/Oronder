import http.client
import json
import os
import re
import sys
from pprint import pprint
from urllib.parse import urlencode

from markdown_it import MarkdownIt

# GitHub Action Secrets
FOUNDRY_PACKAGE_RELEASE_TOKEN = os.environ['FOUNDRY_PACKAGE_RELEASE_TOKEN']
FOUNDRY_USERNAME = os.environ['FOUNDRY_USERNAME']
FOUNDRY_PASSWORD = os.environ['FOUNDRY_PASSWORD']
FOUNDRY_AUTHOR = os.environ['FOUNDRY_AUTHOR']
UPDATE_DISCORD_KEY = os.environ['UPDATE_DISCORD_KEY']

# GitHub Action Variables
UPDATE_DESCRIPTION = bool(int(os.environ.get('UPDATE_DESCRIPTION', '0')))
PUSH_RELEASE = bool(int(os.environ.get('PUSH_RELEASE', '0')))

# Build Variables
PROJECT_URL = os.environ['PROJECT_URL']
CHANGES = os.environ['CHANGES']


def main():
    module_json = get_module_json()

    if PUSH_RELEASE:
        push_release(module_json)
    else:
        print('SKIPPING RELEASE!')

    if UPDATE_DESCRIPTION:
        csrf_token, csrf_middleware_token = get_csrf_tokens()
        session_id = get_session_id(csrf_token, csrf_middleware_token)
        readme = get_readme_as_html()
        send_update(csrf_token, csrf_middleware_token, session_id, readme, module_json)
    else:
        print('SKIPPING FOUNDRY REPO DESCRIPTION UPDATE')

    post_update(module_json['version'])


def get_module_json():
    with open('./module.json', 'r') as file:
        return json.load(file)


def push_release(module):
    conn = http.client.HTTPSConnection("api.foundryvtt.com")
    conn.request(
        "POST", "/_api/packages/release_version/",
        headers={
            'Content-Type': 'application/json',
            'Authorization': FOUNDRY_PACKAGE_RELEASE_TOKEN
        },
        body=json.dumps({
            'id': module['id'],
            'release': {
                'version': module['version'],
                'manifest': f"{PROJECT_URL}/releases/download/{module['version']}/module.json",
                'notes': f"{PROJECT_URL}/releases/tag/{module['version']}",
                'compatibility': module['compatibility']
            }
        })
    )
    response_json = json.loads(conn.getresponse().read().decode())
    if response_json['status'] != 'success':
        raise Exception(pprint.pformat(response_json['errors']))


def get_readme_as_html():
    md = MarkdownIt('commonmark', {'breaks': True, 'html': True}).enable('table')
    with open('./README.md', 'r') as readme_file:
        readme = readme_file.read()
    return md.render(readme)


def get_root():
    conn = http.client.HTTPSConnection('foundryvtt.com')
    conn.request('GET', '/', headers={})
    response = conn.getresponse()
    if response.status != 200:
        raise Exception('csrf_tokens Fack')
    csrf_token = response.getheader('Set-Cookie').split('csrftoken=')[1].split(';')[0].strip()
    csrf_middleware_token = re.search(r'name="csrfmiddlewaretoken" value="([^"]+)"', response.read().decode()).group(1)
    return csrf_token, csrf_middleware_token


def post_auth_login(csrf_token, csrf_middleware_token):
    body = urlencode({
        'csrfmiddlewaretoken': csrf_middleware_token,
        'username': FOUNDRY_USERNAME,
        'password': FOUNDRY_PASSWORD
    })
    headers = {
        'Referer': 'https://foundryvtt.com/',
        'Content-Type': 'application/x-www-form-urlencoded',
        'Cookie': f'csrftoken={csrf_token}; privacy-policy-accepted=accepted'
    }
    conn = http.client.HTTPSConnection('foundryvtt.com')
    conn.request('POST', '/auth/login/', body, headers)
    response = conn.getresponse()
    if response.status == 403:
        raise Exception('login Fack')
    cookies = response.getheader('Set-Cookie')

    session_id = cookies.split('sessionid=')[1].split(';')[0].strip()

    return session_id


def post_packages_oronder_edit(csrf_token, csrf_middleware_token, session_id, description, module):
    conn = http.client.HTTPSConnection('foundryvtt.com')
    headers = {
        'Referer': 'https://foundryvtt.com/packages/oronder/edit',
        'Content-Type': 'application/x-www-form-urlencoded',
        'Cookie': f'csrftoken={csrf_token}; privacy-policy-accepted=accepted; sessionid={session_id}',
    }
    body = urlencode({
        'username': os.environ.get('FOUNDRY_USERNAME'),
        'title': module['title'],
        'description': description,
        'url': PROJECT_URL,
        'csrfmiddlewaretoken': csrf_middleware_token,
        'author': FOUNDRY_AUTHOR,
        'secret-key': FOUNDRY_PACKAGE_RELEASE_TOKEN,
        'requires': '1',
        'tags': ['15', '17'],
    })
    conn.request('POST', '/packages/oronder/edit', body, headers)
    response = conn.getresponse()
    if response.status != 200:
        content = response.read().decode()
        headers = response.headers.as_string()
        err_msg = f'Update Description Failed\n{content=}\n{headers=}'
        raise Exception(err_msg)


def post_update(version):
    conn = http.client.HTTPSConnection("api.oronder.com")
    conn.request(
        "POST", '/update_discord',
        headers={
            'Content-Type': 'application/json',
            'Authorization': UPDATE_DISCORD_KEY
        },
        body=json.dumps({'version': version, 'changes': CHANGES})
    )
    response = conn.getresponse()
    if response.status != 200:
        content = response.read().decode()
        headers = response.headers.as_string()
        err_msg = f'Failed to send Update Message to Discord\n{content=}\n{headers=}'
        raise Exception(err_msg)


if __name__ == '__main__':
    main()

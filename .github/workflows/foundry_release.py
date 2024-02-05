import http.client
import json
import os
import re
import sys
from html.parser import HTMLParser
from pprint import pprint, pformat
from time import sleep
from urllib.parse import urlencode

from markdown_it import MarkdownIt

# GitHub Action Secrets
FOUNDRY_PACKAGE_RELEASE_TOKEN = os.environ['FOUNDRY_PACKAGE_RELEASE_TOKEN']
FOUNDRY_USERNAME = os.environ['FOUNDRY_USERNAME']
FOUNDRY_PASSWORD = os.environ['FOUNDRY_PASSWORD']
FOUNDRY_AUTHOR = os.environ['FOUNDRY_AUTHOR']
UPDATE_DISCORD_KEY = os.environ['UPDATE_DISCORD_KEY']

# Build Variables
CHANGES = os.environ['CHANGES']
FILES_CHANGED = os.environ['FILES_CHANGED']


def push_release(module_json: dict) -> None:
    conn = http.client.HTTPSConnection("api.foundryvtt.com")
    conn.request(
        "POST", "/_api/packages/release_version/",
        headers={
            'Content-Type': 'application/json',
            'Authorization': FOUNDRY_PACKAGE_RELEASE_TOKEN
        },
        body=json.dumps({
            'id': module_json['id'],
            'release': {
                'version': module_json['version'],
                'manifest': f"{module_json['url']}/releases/download/{module_json['version']}/module.json",
                'notes': f"{module_json['url']}/releases/tag/{module_json['version']}",
                'compatibility': module_json['compatibility']
            }
        })
    )
    response_json = json.loads(conn.getresponse().read().decode())
    if response_json['status'] != 'success':
        pprint(module_json)
        raise Exception(pformat(response_json['errors']))
    print('✅ MODULE POSTED TO REPO')


def get_readme_as_html() -> str:
    md = MarkdownIt('commonmark', {'html': True}).enable('table')
    with open('./README.md', 'r') as readme_file:
        readme = readme_file.read()
    return md.render(readme)


def get_tokens() -> (str, str):
    conn = http.client.HTTPSConnection('foundryvtt.com')
    conn.request('GET', '/', headers={})
    response = conn.getresponse()
    if response.status != 200:
        raise Exception(response.reason)
    csrf_token = response.getheader('Set-Cookie').split('csrftoken=')[1].split(';')[0].strip()
    csrf_middleware_token = re.search(r'name="csrfmiddlewaretoken" value="([^"]+)"', response.read().decode()).group(1)
    return csrf_token, csrf_middleware_token


def get_session_id(csrf_token: str, csrf_middleware_token: str) -> str:
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
        raise Exception(response.reason)
    cookies = response.getheader('Set-Cookie')
    return cookies.split('sessionid=')[1].split(';')[0].strip()


def extract_errorlist_text(html_string: str) -> str:
    class ErrorListParser(HTMLParser):
        in_errorlist = False
        errorlist_content = []

        def handle_starttag(self, tag, attrs):
            if tag == "ul":
                for attr, value in attrs:
                    if attr == "class" and "errorlist" in value:
                        self.in_errorlist = True

        def handle_endtag(self, tag):
            if tag == "ul" and self.in_errorlist:
                self.in_errorlist = False

        def handle_data(self, data):
            if self.in_errorlist:
                self.errorlist_content.append(data.strip())

    parser = ErrorListParser()
    parser.feed(html_string)
    return parser.errorlist_content


def post_packages_oronder_edit(csrf_token, csrf_middleware_token, session_id, description, module_json) -> None:
    conn = http.client.HTTPSConnection('foundryvtt.com')
    headers = {
        'Referer': f"https://foundryvtt.com/packages/{module_json['id']}/edit",
        'Content-Type': 'application/x-www-form-urlencoded',
        'Cookie': f'csrftoken={csrf_token}; privacy-policy-accepted=accepted; sessionid={session_id}',
    }
    body = urlencode([
        ('username', FOUNDRY_USERNAME),
        ('title', module_json['title']),
        ('description', description),
        ('url', module_json['url']),
        ('csrfmiddlewaretoken', csrf_middleware_token),
        ('author', FOUNDRY_AUTHOR),
        ('secret-key', FOUNDRY_PACKAGE_RELEASE_TOKEN),
        ('requires', 1),
        ('tags', 15),
        ('tags', 17)
    ])
    conn.request('POST', f"/packages/{module_json['id']}/edit", body, headers)
    response = conn.getresponse()
    if response.status != 302:
        content = response.read().decode()
        raise Exception(f'Update Description Failed\n{extract_errorlist_text(content)}')


def post_update_to_discord(version) -> None:
    deduped_changes = '\n'.join(dict.fromkeys(CHANGES.split('\n')))
    conn = http.client.HTTPSConnection("api.oronder.com")
    conn.request(
        "POST", '/update_discord',
        headers={
            'Content-Type': 'application/json',
            'Authorization': UPDATE_DISCORD_KEY
        },
        body=json.dumps({'version': version, 'changes': deduped_changes})
    )
    response = conn.getresponse()
    if response.status != 200:
        content = response.read().decode()
        headers = response.headers.as_string()
        raise Exception(f'Failed to send Update Message to Discord\n{content=}\n{headers=}')
    print('✅ DISCORD NOTIFIED OF NEW RELEASE')


def update_repo_description(module_json):
    if any(f in FILES_CHANGED for f in ['README.md', 'module.json']):
        csrf_token, csrf_middleware_token = get_tokens()
        session_id = get_session_id(csrf_token, csrf_middleware_token)
        readme = get_readme_as_html()
        post_packages_oronder_edit(csrf_token, csrf_middleware_token, session_id, readme, module_json)
        print('✅ REPO DESCRIPTION UPDATED')
        for i in range(10):
            print('💤' * (10 - i))
            sleep(1)
    else:
        print('🪧 SKIPPING REPO DESCRIPTION UPDATE')


def main():
    if all(f.startswith('.github') for f in FILES_CHANGED.split()):
        print('⛔ SKIPPING DEPLOYMENT')

    with open('./module.json', 'r') as file:
        module_json = json.load(file)

    update_repo_description(module_json)
    push_release(module_json)
    post_update_to_discord(module_json['version'])


if __name__ == '__main__':
    main()

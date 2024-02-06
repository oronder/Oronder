import json
import os
import re
from html.parser import HTMLParser
from http.client import HTTPSConnection
from pprint import pformat
from urllib.parse import urlencode

from markdown_it import MarkdownIt

# Secrets
FOUNDRY_PACKAGE_RELEASE_TOKEN = os.environ['FOUNDRY_PACKAGE_RELEASE_TOKEN']
FOUNDRY_USERNAME = os.environ['FOUNDRY_USERNAME']
FOUNDRY_PASSWORD = os.environ['FOUNDRY_PASSWORD']
FOUNDRY_AUTHOR = os.environ['FOUNDRY_AUTHOR']
UPDATE_DISCORD_KEY = os.environ['UPDATE_DISCORD_KEY']
SECRETS = [FOUNDRY_PACKAGE_RELEASE_TOKEN, FOUNDRY_USERNAME, FOUNDRY_PASSWORD, FOUNDRY_AUTHOR, UPDATE_DISCORD_KEY]

# Environment Variables
GITHUB_URL = os.environ['GITHUB_URL']
TAG = os.environ['TAG']
CHANGES = os.environ['CHANGES']
FILES_CHANGED = os.environ['FILES_CHANGED']


def main():
    if all(f.startswith('.github') for f in FILES_CHANGED.split()):
        SKIP('SKIPPING DEPLOYMENT. ONLY RELEASE CONFIG MODIFIED')
        for f in FILES_CHANGED.split():
            INFO(f)
        return

    with open('./module.json', 'r') as file:
        module_json = json.load(file)

    update_repo_description(module_json)
    push_release(module_json)
    post_update_to_discord()


def update_repo_description(module_json):
    if not any(f in FILES_CHANGED for f in ['README.md', 'module.json', 'foundry_release.py']):
        SKIP('SKIPPING REPO DESCRIPTION UPDATE')
        return

    INFO('Acquiring CSRF tokens')
    conn = HTTPSConnection('foundryvtt.com')
    conn.request('GET', '/', headers={})
    response = conn.getresponse()
    if response.status != 200:
        BAD(response.reason)
    csrf_token = response.getheader('Set-Cookie').split('csrftoken=')[1].split(';')[0].strip()
    csrf_middleware_token = re.search(r'name="csrfmiddlewaretoken" value="([^"]+)"', response.read().decode()).group(1)

    INFO('Acquiring session id')
    conn = HTTPSConnection('foundryvtt.com')
    conn.request('POST', '/auth/login/',
                 headers={
                     'Referer': 'https://foundryvtt.com/',
                     'Content-Type': 'application/x-www-form-urlencoded',
                     'Cookie': f'csrftoken={csrf_token}; privacy-policy-accepted=accepted'
                 },
                 body=urlencode({
                     'csrfmiddlewaretoken': csrf_middleware_token,
                     'username': FOUNDRY_USERNAME,
                     'password': FOUNDRY_PASSWORD
                 }))
    response = conn.getresponse()
    if response.status == 403:
        BAD(response.reason)
    session_id = response.getheader('Set-Cookie').split('sessionid=')[1].split(';')[0].strip()

    INFO('Converting README.md to html')
    md = MarkdownIt('commonmark', {'html': True}).enable('table')
    with open('./README.md', 'r') as readme_file:
        readme_contents = readme_file.read()
    readme = md.render(readme_contents)

    INFO('Updating Foundry VTT Module Repository Description')
    conn = HTTPSConnection('foundryvtt.com')
    conn.request('POST', f"/packages/{module_json['id']}/edit",
                 headers={
                     'Referer': f"https://foundryvtt.com/packages/{module_json['id']}/edit",
                     'Content-Type': 'application/x-www-form-urlencoded',
                     'Cookie': f'csrftoken={csrf_token}; privacy-policy-accepted=accepted; sessionid={session_id}',
                 },
                 body=urlencode([
                     ('username', FOUNDRY_USERNAME),
                     ('title', module_json['title']),
                     ('description', readme),
                     ('url', module_json['url']),
                     ('csrfmiddlewaretoken', csrf_middleware_token),
                     ('author', FOUNDRY_AUTHOR),
                     ('secret-key', FOUNDRY_PACKAGE_RELEASE_TOKEN),
                     ('requires', 1),
                     ('tags', 15),
                     ('tags', 17)
                 ]))
    response = conn.getresponse()
    if response.status != 302:
        BAD(f'Update Description Failed\n{extract_errorlist_text(response.read().decode())}')
    GOOD('REPO DESCRIPTION UPDATED')


def push_release(module_json: dict) -> None:
    INFO('Pushing new release to Foundry VTT Module Repository')
    conn = HTTPSConnection("api.foundryvtt.com")
    conn.request(
        "POST", "/_api/packages/release_version/",
        headers={
            'Content-Type': 'application/json',
            'Authorization': FOUNDRY_PACKAGE_RELEASE_TOKEN
        },
        body=json.dumps({
            'id': module_json['id'],
            'release': {
                'version': TAG,
                'manifest': f"{GITHUB_URL}/releases/download/{TAG}/module.json",
                'notes': f"{GITHUB_URL}/releases/tag/{TAG}",
                'compatibility': module_json['compatibility']
            }
        })
    )
    response_json = json.loads(conn.getresponse().read().decode())
    if response_json['status'] != 'success':
        BAD(pformat(response_json['errors']))
    GOOD('MODULE POSTED TO REPO')


def post_update_to_discord() -> None:
    INFO('Notifying Discord of new release')
    deduped_changes = '\n'.join(dict.fromkeys(CHANGES.split('\n')))
    conn = HTTPSConnection("api.oronder.com")
    conn.request(
        "POST", '/update_discord',
        headers={
            'Content-Type': 'application/json',
            'Authorization': UPDATE_DISCORD_KEY
        },
        body=json.dumps({'version': TAG, 'changes': deduped_changes})
    )
    response = conn.getresponse()
    if response.status != 200:
        content = response.read().decode()
        headers = response.headers.as_string()
        BAD(f'Failed to send Update Message to Discord\n{content=}\n{headers=}')
    GOOD('DISCORD NOTIFIED OF NEW RELEASE')


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


def safe_print(s: str):
    for secret in SECRETS:
        s = s.replace(secret, '*****')
    print(s)


def INFO(s: str):
    safe_print(f'  {s}')


def SKIP(s: str):
    safe_print(f'🪧 {s}')


def GOOD(s: str):
    safe_print(f'✅ {s}')


def BAD(s: str):
    safe_print(f'❌ {s}')
    exit(1)


if __name__ == '__main__':
    main()

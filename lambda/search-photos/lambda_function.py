import json
import logging
import boto3
from elasticsearch import Elasticsearch, RequestsHttpConnection
from requests_aws4auth import AWS4Auth

def lambda_handler(event, context):
    client = boto3.client('lex-runtime')
    query = event['queryStringParameters']['q']
    
    response = client.post_text(
        botName='PhotoAlbumSearch',
        botAlias='photo_search',
        userId='user',
        inputText=query)
        
    labels = [response['slots']['Label']]
    if response['slots']['OtherLabel']:
        labels += [response['slots']['OtherLabel']]

    credentials = boto3.Session().get_credentials()
    region = 'us-east-1'
    service = 'es'
    awsauth = AWS4Auth(credentials.access_key, credentials.secret_key, region, service, session_token=credentials.token)
    host = 'search-photos-gqyfhfedjzf3j2pgrvtqiocjxi.us-east-1.es.amazonaws.com'
    es = Elasticsearch(
        hosts = [{'host': host, 'port': 443}],
        http_auth = awsauth,
        use_ssl = True,
        verify_certs = True,
        connection_class = RequestsHttpConnection
    )
    index = 'photos'

    query = {
        'query': {
            'term': {
                'labels': labels
            }
        }
    }
    res = es.search(index=index, body=query)
    return {
        'statusCode': 200,
        'body': json.dumps(res)
    }

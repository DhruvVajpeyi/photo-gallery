import json
import logging
import boto3
from elasticsearch import Elasticsearch, RequestsHttpConnection
from requests_aws4auth import AWS4Auth
from urllib.parse import unquote

logger = logging.getLogger()
logger.setLevel(logging.DEBUG)

def lambda_handler(event, context):
    client = boto3.client('lex-runtime')
    query = unquote(event['queryStringParameters']['q'])
    
    s3_client = boto3.client('s3')
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
            'terms': {
                'labels': labels
            }
        }
    }
    es_res = es.search(index=index, body=query)
    results = {
        'results': [{
            'url': s3_client.generate_presigned_url('get_object',
                                                    Params={'Bucket': item['_source']['bucket'],
                                                            'Key': item['_source']['objectKey']},
                                                    ExpiresIn=60),
            'labels': item['_source']['labels']
        } for item in es_res['hits']['hits']]
    }
    
    return {
        'statusCode': 200,
        'headers': {
            'Access-Control-Allow-Headers' : 'Content-Type',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'OPTIONS,POST,GET'
        },
        'body': json.dumps(results)
    }

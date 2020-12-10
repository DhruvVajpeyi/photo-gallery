import json
import boto3
import logging
from elasticsearch import Elasticsearch, RequestsHttpConnection
from requests_aws4auth import AWS4Auth

logger = logging.getLogger()
logger.setLevel(logging.DEBUG)

def lambda_handler(event, context):
    rek_client = boto3.client('rekognition')

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
    
    for record in event['Records']:
        bucket = record['s3']['bucket']['name']
        name = record['s3']['object']['key']
        label_resp = rek_client.detect_labels(
            Image={
                'S3Object': {
                    'Bucket': bucket,
                    'Name': name
                }
            })
            
        es_object = {
            'objectKey': name,
            'bucket': bucket,
            'createdTimestamp': record['eventTime'],
            'labels': [label['Name'] for label in label_resp['Labels']]
        }

        es.index(index=index, body=es_object, id=name)
        
    return {
        'statusCode': 200,
        'body': json.dumps('Hello from Lambda!')
    }

import boto3

session = boto3.Session(profile_name='test')
client = session.client('codedeploy')

response = client.update_deployment_group(
    applicationName='MyApplication',
    currentDeploymentGroupName='MyDeploy',
    # newDeploymentGroupName='string',
    # deploymentConfigName='string',
    autoScalingGroups=[
        'MyASG',
    ],
    # serviceRoleArn='string',
    deploymentStyle={
        'deploymentType': 'BLUE_GREEN',
        'deploymentOption': 'WITH_TRAFFIC_CONTROL'
    },
    blueGreenDeploymentConfiguration={
        'terminateBlueInstancesOnDeploymentSuccess': {
            'action': 'TERMINATE',
            'terminationWaitTimeInMinutes': 0
        },
        'deploymentReadyOption': {
            'actionOnTimeout': 'CONTINUE_DEPLOYMENT',
            'waitTimeInMinutes': 0
        },
        'greenFleetProvisioningOption': {
            'action': 'COPY_AUTO_SCALING_GROUP'
        }
    },
    loadBalancerInfo={
        # 'elbInfoList': [
        #     {
        #         'name': 'string'
        #     },
        # ],
        'targetGroupInfoList': [
            {
                'name': 'MyTargetGroup'
            },
        ],
        # 'targetGroupPairInfoList': [
        #     {
        #         'targetGroups': [
        #             {
        #                 'name': 'string'
        #             },
        #         ],
        #         'prodTrafficRoute': {
        #             'listenerArns': [
        #                 'string',
        #             ]
        #         },
        #         'testTrafficRoute': {
        #             'listenerArns': [
        #                 'string',
        #             ]
        #         }
        #     },
        # ]
    }
)
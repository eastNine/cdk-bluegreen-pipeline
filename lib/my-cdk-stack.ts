import * as cdk from '@aws-cdk/core';
import * as autoscaling from '@aws-cdk/aws-autoscaling';
import * as ec2 from '@aws-cdk/aws-ec2';
import * as elbv2 from '@aws-cdk/aws-elasticloadbalancingv2';
import * as iam from '@aws-cdk/aws-iam';
import * as s3 from '@aws-cdk/aws-s3';
import codecommit = require('@aws-cdk/aws-codecommit');
import codebuild = require('@aws-cdk/aws-codebuild');
import codedeploy = require('@aws-cdk/aws-codedeploy');
import codepipeline = require('@aws-cdk/aws-codepipeline');
import codepipeline_actions = require('@aws-cdk/aws-codepipeline-actions');

export class MyCdkStack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // The code that defines your stack goes here
    // VPC
    // const vpc = ec2.Vpc.fromLookup(this, 'vpc', {
    //     //vpcName: 'wmp-live'
    //     vpcId: 'vpc-0a0f87bf133b4640a'
    // });
    const vpc = new ec2.Vpc(this, 'Vpc', {
      maxAzs: 2
    });
    // Private Subnet
    // const priSubnet1 = ec2.Subnet.fromSubnetAttributes(this, 'prisubnet1', {
    //     availabilityZone: 'ap-northeast-2a', //'apne2-az1',
    //     subnetId: 'subnet-0194d72396284c352' //wmp-private.a
    // });
    
    const lb = new elbv2.ApplicationLoadBalancer(this, 'LB', {
      vpc,
      internetFacing: true
    });
    
    // Add a listener and open up the load balancer's security group
    // to the world.
    const listener = lb.addListener('Listener', {
      port: 80,
      // 'open: true' is the default, you can leave it out if you want. Set it
      // to 'false' and use `listener.connections` if you want to be selective
      // about who can access the load balancer.
      open: true,
    });
    new cdk.CfnOutput(this, 'lb', { value: lb.loadBalancerName });
    
    const ssm = iam.ManagedPolicy.fromManagedPolicyArn(this, 'ssmP', 'arn:aws:iam::aws:policy/service-role/AmazonEC2RoleforSSM');
    const s3Policy = iam.ManagedPolicy.fromManagedPolicyArn(this, 's3P', 'arn:aws:iam::aws:policy/AmazonS3ReadOnlyAccess');
    
    const ec2Role = new iam.Role(this, 'ec2Role', {
      assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com'),
      managedPolicies: [
        ssm,
        s3Policy
      ]
    });
  
    // Create an AutoScaling group and add it as a load balancing
    // target to the listener.
    const userdata = ec2.UserData.forLinux();
    userdata.addCommands('sudo apt update');
    userdata.addCommands('sudo apt -y install ruby-full');
    userdata.addCommands('sudo apt -y install wget');
    userdata.addCommands('cd /home/ubuntu');
    userdata.addCommands('wget https://aws-codedeploy-ap-northeast-2.s3.ap-northeast-2.amazonaws.com/latest/install');
    userdata.addCommands('chmod +x ./install');
    userdata.addCommands('sudo ./install auto');
    
    const asg = new autoscaling.AutoScalingGroup(this, 'ASG', {
      vpc,
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.BURSTABLE2, ec2.InstanceSize.MICRO),
      machineImage: ec2.MachineImage.genericLinux({
            'ap-northeast-2': 'ami-0454bb2fefc7de534' // ubuntu focal latest
        }),
      role: ec2Role,
      userData: userdata,
      autoScalingGroupName: 'MyASG'
    });
    const tg = listener.addTargets('ApplicationFleet', {
      targetGroupName: 'MyTargetGroup',
      port: 80,
      targets: [asg]
    });
    new cdk.CfnOutput(this, 'asg', { value: asg.autoScalingGroupName });
    new cdk.CfnOutput(this, 'lbtg', { value: tg.targetGroupName });
    
    const repo = new codecommit.Repository(this, 'Repository', {
      repositoryName: 'MyRepo',
      description: 'My Repository', // optional property
    });
    new cdk.CfnOutput(this, 'repo', { value: repo.repositoryCloneUrlGrc });
    
    const buildArtifactsBucket = new s3.Bucket(this, 'BuildArtifactsBucket');
    
    const application = new codedeploy.ServerApplication(this, 'CodeDeployApplication', {
      applicationName: 'MyApplication', // optional property
    });
    new cdk.CfnOutput(this, 'CDApplication', { value: application.applicationName });
    
    const deploymentGroup = new codedeploy.ServerDeploymentGroup(this, 'CodeDeployDeploymentGroup', {
      application,
      deploymentGroupName: 'MyDeploy',
      deploymentConfig: codedeploy.ServerDeploymentConfig.ALL_AT_ONCE,
      //autoScalingGroups: [asg1, asg2],
      // adds User Data that installs the CodeDeploy agent on your auto-scaling groups hosts
      // default: true
      //installAgent: true,
      // adds EC2 instances matching tags
      ec2InstanceTags: new codedeploy.InstanceTagSet(
        {
          // any instance with tags satisfying
          // key1=v1 or key1=v2 or key2 (any value) or value v3 (any key)
          // will match this group
          //'Name': [ProjectName+'Dev01']
          //'Name': [instanceName4devdeploy]
        },
      ),
      // adds on-premise instances matching tags
      //onPremiseInstanceTags: new codedeploy.InstanceTagSet(
      //    // only instances with tags (key1=v1 or key1=v2) AND key2=v3 will match this set
      //    {
      //        'key1': ['v1', 'v2'],
      //    },
      //    {
      //        'key2': ['v3'],
      //    },
      //),
      // CloudWatch alarms
      //alarms: [
      //    new cloudwatch.Alarm(/* ... */),
      //],
      // whether to ignore failure to fetch the status of alarms from CloudWatch
      // default: false
      ignorePollAlarmsFailure: false,
      // auto-rollback configuration
      autoRollback: {
        failedDeployment: true, // default: true
        stoppedDeployment: false, // default: false
        deploymentInAlarm: false, // default: true if you provided any alarms, false otherwise
      },
    });
    new cdk.CfnOutput(this, 'CDDeploymentGroup', { value: deploymentGroup.deploymentGroupName });
    
    const sourceOutput = new codepipeline.Artifact();
    const buildOutput = new codepipeline.Artifact();
    
    const pipeline = new codepipeline.Pipeline(this, 'MyFirstPipeline', {
      pipelineName: 'MyPipeline',
      artifactBucket: buildArtifactsBucket
    });
    
    const sourceAction = new codepipeline_actions.CodeCommitSourceAction({
      actionName: 'CodeCommit',
      repository: repo,
      branch: 'master',
      output: sourceOutput
    });
    pipeline.addStage({
      stageName: 'Source',
      actions: [sourceAction],
    });
    const deployAction = new codepipeline_actions.CodeDeployServerDeployAction({
      actionName: 'Deploy',
      input: sourceOutput,
      deploymentGroup,
    });
    pipeline.addStage({
      stageName: 'Deploy',
      actions: [deployAction],
    });
  }
}

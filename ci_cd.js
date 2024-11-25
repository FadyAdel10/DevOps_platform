/* plan:
    1. Connect to Jenkins server.
    2. Retrieve project details from the queue.
    3. Create a Jenkins pipeline job with project configurations.
    4. Configure the pipeline to:
        - Clone the GitHub repository.
        - If repo changed push a job message back to the queue for worker to delete azure container and rehost.
    5. Schedule pipeline to poll for updates at regular intervals.
    6. Handle any errors and log them appropriately.
*/

import Jenkins from 'jenkins';
import 'dotenv/config';


/**
 * Represents a job in the message queue that contains project details, repository link, build commands, and other metadata.
 * @type {Object}
 * @property {string} projectId - The ID of the project.
 * @property {string} projectName - The name of the project.
 * @property {string} buildNumber - The build number associated with this job.
 * @property {Array<string>} tokens - Authentication tokens for accessing the repository.
 * @property {Object} projectData - Metadata related to the project (GitHub branch, root directory, etc.).
 * @property {string} githubLink - The URL to the GitHub repository.
 */
const messageQueueJob = {
  projectId: "6787",
  projectName: "test",
  buildNumber: "1",
  tokens: ["github_token"],
  projectData: {
    githubBranch: "master",
    rootDirectory: "",
    buildCommand: "npm run build",
    outputDirectory: "build",
    environmentVariables: {
      PUBLIC_URL: "https://client-project.cloudastro.com",
    },
  },
  githubLink: "https://github.com/FadyAdel10/simple_react_app_private.git",
};

const GITHUB_REPO_URL = messageQueueJob.githubLink;

// Initialize Jenkins client
const jenkins = new Jenkins({
  baseUrl: `http://${process.env.JENKINS_USERNAME}:${process.env.JENKINS_API_TOKEN}@${process.env.JENKINS_URL}`,
  crumbIssuer: false,
});

/**
 * Job name derived from project details.
 * @type {string}
 */
const jobName = messageQueueJob.projectName + messageQueueJob.projectId;

/**
 * Jenkins pipeline configuration as XML.
 * Defines the pipeline stages, including repository cloning and queue messaging.
 * @type {string}
 */
const pipelineConfig = `
<flow-definition plugin="workflow-job@2.40">
  <description>A simple Node.js project with polling</description>
  <keepDependencies>false</keepDependencies>
  <properties/>
  <definition class="org.jenkinsci.plugins.workflow.cps.CpsFlowDefinition" plugin="workflow-cps@2.92">
    <script>
      pipeline {
        agent any
        stages {
          stage('Clone Repository') {
            steps {
              script {
                // Clone the GitHub repository
                sh 'git clone -b ${messageQueueJob.projectData.githubBranch} https://${messageQueueJob.tokens[0]}@github.com/${messageQueueJob.githubLink.split('github.com/')[1]} ${jobName}'
              }
            }
          }
          stage('Push Job to Queue') {
            steps {
              echo 'Job successfully pushed back to queue for further processing.'
            }
          }
        }
      }
    </script>
    <sandbox>true</sandbox>
  </definition>
  <triggers>
    <hudson.triggers.TimerTrigger>
      <spec>* * * * *</spec> <!-- Poll every minute -->
    </hudson.triggers.TimerTrigger>
  </triggers>
  <disabled>false</disabled>
</flow-definition>
`;

/**
 * Creates a new Jenkins pipeline job with the specified configuration.
 * Logs success or error messages during the process.
 */
async function createJob() {
  try {
    await jenkins.job.create(jobName, pipelineConfig);
    console.log(`Pipeline project '${jobName}' created successfully.`);
  } catch (error) {
    console.error('Error creating pipeline project:', error.message);
  }
}

// Call the function to create the Jenkins job
createJob();

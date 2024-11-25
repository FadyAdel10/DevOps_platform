/* plan:
    read data from queue
    
    run node container 
        
    clone repo in container 
    
    cd root directory
    
    if there is build command then build the project 
    
    and then map the data to volume ,
    the data is production file if there is build other it will be all files
    
    then upload datat on azure
    
    then retutn message to another instance of queue, do not forget to sent also all build logs
*/

import Docker from 'dockerode';

/**
 * Initialize Docker client using the default socket.
 * @type {Docker}
 */
const docker = new Docker();

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
    projectId: "6789", 
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

/**
 * Flags for build and output directory checks.
 * @type {number}
 */
let building_framework_flag = 0;
let output_directory_flag = 0;

// Check if a build command exists in the job data.
if (messageQueueJob.projectData.buildCommand) {
    building_framework_flag = 1;
}

// Check if an output directory is defined.
if (messageQueueJob.projectData.outputDirectory !== undefined) {
    output_directory_flag = 1;
}

/**
 * Checks if the specified Docker image is available locally.
 * 
 * @param {string} imageName - The name of the Docker image to check.
 * @returns {Promise<boolean>} - A promise that resolves to `true` if the image exists locally, otherwise `false`.
 */
const isImageAvailable = async (imageName) => {
    const images = await docker.listImages();
    return images.some(image => image.RepoTags && image.RepoTags.includes(imageName));
};

/**
 * Runs a Docker container based on the specified configuration, clones the repository into the container, installs dependencies, 
 * runs the build command (if defined), and starts the application.
 */
const runDockerContainer = async () => {
    try {
        const imageName = 'node:18-buster';

        // Check if the specified Docker image is available locally.
        console.log(`Checking if the image ${imageName} exists locally...`);
        const imageExists = await isImageAvailable(imageName);

        if (!imageExists) {
            console.log("fady image is not found");
        } else {
            console.log(`${imageName} found locally.`);
        }
        
        // Paths for mounting volumes between host and container
        const host_path = '/home/fady/projects';
        const container_path = '/usr/src/app';

        // Start the container using the 'node' image.
        console.log('Creating container...');
        const container = await docker.createContainer({
            Image: imageName,
            name: messageQueueJob.projectName, // Name for the container
            Cmd: ['/bin/bash', '-c', `
                # If the directory is empty, clone the repository
                if [ ! "$(ls -A /usr/src/app)" ]; then
                    git clone -b ${messageQueueJob.projectData.githubBranch} https://${messageQueueJob.tokens[0]}@github.com/${messageQueueJob.githubLink.split('github.com/')[1]} ${container_path};
                fi &&
                
                # Navigate to the project root directory
                cd /usr/src/app/${messageQueueJob.projectData.rootDirectory} &&

                # Install dependencies using npm
                npm install &&

                # If there's a build command, run it
                if [ ${building_framework_flag} -eq 1 ]; then
                    ${messageQueueJob.projectData.buildCommand}; 
                fi && 

                # Start the application
                npm run start
            `], // Command to run inside the container
            Tty: true,
            HostConfig: {
                Binds: [
                    // Bind mount a host directory to the container's directory
                    `${host_path}:${container_path}/${messageQueueJob.projectData.rootDirectory}`
                ]
            }
        });

        console.log('Container created with ID:', container.id);

        // Start the container
        await container.start();
        console.log('Container started successfully');

    } catch (error) {
        console.error('Error starting container:', error);
    }
};

// Call the function to start the Docker container
runDockerContainer();


//remove docker container


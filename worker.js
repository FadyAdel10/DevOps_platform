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
 */
const messageQueueJob = {
    project_id: "6789",
    project_name: "test",
    build_no: "1",
    tokens: ["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"],
    configurations: {
        branch: "master",
        root_dir: "",
        build_command: "npm run build",
        out_dir: "dist",
        env_vars: {
            PUBLIC_URL: "https://client-project.cloudastro.com",
        },
    },
    repo_url: "https://github.com/FadyAdel10/simple_vite_app_private_2.git",
};

/**
 * Flags for build and output directory checks.
 */
let building_framework_flag = false;
let output_directory_flag = false;

// Check if a build command exists in the job data.
if (messageQueueJob.configurations.build_command) {
    building_framework_flag = true;
}

// Check if an output directory is defined.
if (messageQueueJob.configurations.out_dir) {
    output_directory_flag = true;
}

/**
 * Checks if the specified Docker image is available locally.
 * 
 * @param {string} imageName - The name of the Docker image to check.
 * @returns {Promise<boolean>} - Resolves to `true` if the image exists locally, otherwise `false`.
 */
const isDockerImageAvailable = async (imageName) => {
    const images = await docker.listImages();
    return images.some(image => image.RepoTags && image.RepoTags.includes(imageName));
};

/**
 * Runs a Docker container to clone a repository, install dependencies, optionally build the project,
 * and start the application.
 */
const runDockerContainer = async () => {
    try {
        const imageName = 'node:18-buster';

        // Check if the Docker image is available locally.
        console.log(`Checking if the image ${imageName} exists locally...`);
        const imageExists = await isDockerImageAvailable(imageName);

        if (!imageExists) {
            console.log(`${imageName} is not found locally.`);
        } else {
            console.log(`${imageName} found locally.`);
        }

        // Paths for mounting volumes between host and container
        const hostPath = '/home/fady/projects';
        const containerPath = '/usr/src/app';

        // Create a Docker container
        console.log('Creating container...');
        const container = await docker.createContainer({
            Image: imageName,
            name: messageQueueJob.project_name,
            Cmd: ['/bin/bash', '-c', `
                # Clone the repository if the directory is empty
                if [ ! "$(ls -A ${containerPath})" ]; then
                    git clone -b ${messageQueueJob.configurations.branch} https://${messageQueueJob.tokens[0]}@github.com/${messageQueueJob.repo_url.split('github.com/')[1]} ${containerPath};
                fi &&

                # Navigate to the project root directory
                cd ${containerPath}/${messageQueueJob.configurations.root_dir} &&

                # Install dependencies only if package.json exists
                if [ -f "package.json" ]; then
                    npm install;
                fi &&

                # Run the build command if defined
                ${building_framework_flag ? `${messageQueueJob.configurations.build_command} &&` : ''}

                # Keep the container running
                tail -f /dev/null
            `],
            Tty: true,
            Env: Object.entries(messageQueueJob.configurations.env_vars).map(([key, value]) => `${key}=${value}`),
            HostConfig: {
                Binds: [
                    // Bind mount a host directory to the container's directory
                    `${hostPath}:${containerPath}/${messageQueueJob.configurations.root_dir}`,
                ],
            },
        });

        console.log('Container created with ID:', container.id);

        // Start the Docker container
        await container.start();
        console.log('Container started successfully');

    } catch (error) {
        console.error('Error starting container:', error);
    }
};

// Execute the Docker container workflow
runDockerContainer();


//remove docker container

// docker.getExec(){
//     here execute commands like:
//     if()
// }
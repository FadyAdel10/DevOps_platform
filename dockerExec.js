const messageQueueJob = {
    project_id: "6786",
    project_name: "test",
    build_no: "1",
    tokens: ["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"],
    configurations: {
        branch: "master",
        root_dir: "my-vite-app",
        build_command: "npm run build",
        out_dir: "dist",
        env_vars: {
            PUBLIC_URL: "https://client-project.cloudastro.com",
        },
    },
    repo_url: "https://github.com/FadyAdel10/simple_vite_app_private.git",
};

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

const hostPath = process.env.HOST_PATH + `/${messageQueueJob.project_name}${messageQueueJob.project_id}` //`${process.env.HOST_PATH}`; /*createProjectFolder();*/
const containerPath = '/usr/src/app';
const bindingDir = '/usr/src/buildDir';

const commands = [ 
    `# Check if the directory is empty and clone the repo
    if [ ! "$(ls -A ${containerPath})" ]; then
        echo "Cloning repository...";
        git clone -b ${messageQueueJob.configurations.branch} ${messageQueueJob.repo_url} ${containerPath}
    fi`,
    `# Navigate to the project root directory
    cd ${containerPath}/${messageQueueJob.configurations.root_dir} && ls -a`,
    `# Check and print environment variables
    echo "Testing environment variables..." &&
    printenv | grep PUBLIC_URL || echo "PUBLIC_URL not found."`,
    `# Install dependencies if package.json exists
    if [ -f "package.json" ]; then
        npm install
    fi && ls`,
    `# Run build command if specified
    ${building_framework_flag ? `${messageQueueJob.configurations.build_command}` : ''}`,

    `# check the build files (ls -a)
    echo "Checking for build files: "
    ls -a`,

    `# copy build files to the binding directory
    ${output_directory_flag ? `cp -r ./${messageQueueJob.configurations.out_dir} ${bindingDir}`:`cp -r * ${bindingDir}`}`,
    
    `echo "Files were copied"`,

    `# Keep the container running
    # tail -f /dev/null`
];

export const dockerExec = async (container,i)=>{
    if(i >= commands.length) return 1;
    let cmd = ['/bin/bash', '-c'];
    cmd = [...cmd, commands[i]];

    let exec;
    if(i > 0){
        exec = await container.exec({
            cmd: cmd,
            AttachStdout: true,
            AttachStderr: true,
            workingDir: `${containerPath}/${messageQueueJob.configurations.root_dir}`
        });
    }else{
        exec = await container.exec({
            cmd: cmd,
            AttachStdout: true,
            AttachStderr: true
        });
    }

    const stream = await exec.start({});

    stream.on('data', (data) => {
        console.log(data.toString()); // Print output from the container
    });

    stream.on('error', (error) => {
        console.error(error.message); // Print output from the container
    });

    stream.on('end', async () => {
        console.log(`${i}th command is done`); // Print output from the container
         // Check the exit code
        const result = await exec.inspect();
        if (result.ExitCode !== 0) {
            console.error(`Command failed with exit code ${result.ExitCode}`);
        } else {
            console.log('Command executed successfully.');
            return dockerExec(container,++i);
        }
    });
}
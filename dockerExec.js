export const dockerExecMain = (container,messageQueueJob, building_framework_flag, output_directory_flag, containerPath, bindingDir) =>{
    let cumLogs = ""
    const commands = [ 
        `# Check if the directory is empty and clone the repo
        echo "Clone stage:"
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
        echo "Installing node modules"
        if [ -f "package.json" ]; then
            npm install
        fi && ls`,
        `# Run build command if specified
        echo "Build stage"
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

    const dockerExec = async (container,i)=>{
        if(i >= commands.length) {
            // deploy()
            console.log(cumLogs)
            return 1;
        }
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
            cumLogs += data.toString()
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

    dockerExec(container,0);

    console.log("end");
}   


// export 
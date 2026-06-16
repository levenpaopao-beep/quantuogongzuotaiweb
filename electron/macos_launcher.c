#include <mach-o/dyld.h>
#include <sys/stat.h>
#include <unistd.h>
#include <fcntl.h>
#include <libgen.h>
#include <limits.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

static void parent_dir(char *path) {
    char *slash = strrchr(path, '/');
    if (slash && slash != path) {
        *slash = '\0';
    }
}

int main(void) {
    char executable[PATH_MAX];
    uint32_t size = sizeof(executable);
    if (_NSGetExecutablePath(executable, &size) != 0) {
        return 1;
    }

    char resolved[PATH_MAX];
    if (!realpath(executable, resolved)) {
        return 1;
    }

    char app_root[PATH_MAX];
    strncpy(app_root, resolved, sizeof(app_root) - 1);
    app_root[sizeof(app_root) - 1] = '\0';
    parent_dir(app_root); // Contents/MacOS
    parent_dir(app_root); // Contents
    parent_dir(app_root); // *.app
    parent_dir(app_root); // project root

    if (chdir(app_root) != 0) {
        return 1;
    }

    mkdir("outputs", 0755);
    int log_fd = open("outputs/daily_ops_electron.log", O_CREAT | O_WRONLY | O_APPEND, 0644);
    if (log_fd >= 0) {
        dup2(log_fd, STDOUT_FILENO);
        dup2(log_fd, STDERR_FILENO);
        close(log_fd);
    }

    char electron_path[PATH_MAX];
    snprintf(electron_path, sizeof(electron_path), "%s/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron", app_root);

    if (access(electron_path, X_OK) != 0) {
        setenv("ELECTRON_MIRROR", "https://npmmirror.com/mirrors/electron/", 1);
        char install_cmd[PATH_MAX + 128];
        snprintf(install_cmd, sizeof(install_cmd), "npm install --cache '%s/.npm-cache'", app_root);
        int install_status = system(install_cmd);
        if (install_status != 0) {
            return 1;
        }
    }

    execl(electron_path, electron_path, app_root, (char *)NULL);
    return 1;
}

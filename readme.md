# VSCode Java Debugger

This is a VSCode plugin for a Java debugger that communicates directly with the debugged application via the Java Debug Wire Protocol (https://docs.oracle.com/javase/8/docs/technotes/guides/jpda/jdwp-spec.html).

This app is currently in development and isn't exactly usable yet, but currently can do the following:
* Attach to an already running application with an open debug socket.
* Show all currently running threads.
* Pause/resume execution for the entire VM.
* Pause/resume execution for any given thread. Except the last thread. See open issues for more info.
* Show a callstack with decoded class and method. 
* If the file exists in your workspace variable set in launch.json, you'll get file and line number information. If you click on such a method in the stack trace, you'll be taken to the file. There are edge cases that are almost certainly broken here. See open issues.

package io.github.crmapache.amazingclaudecode.startup

import com.intellij.openapi.project.Project
import com.intellij.openapi.startup.ProjectActivity
import io.github.crmapache.amazingclaudecode.remote.RemoteAgent

/**
 * Lets the agent know a project has opened.
 *
 * It does no work and opens no socket: with remote access off - which is how it ships and how it stays
 * unless someone turns it on - this costs one comparison per project. The connection is raised only
 * when the feature is on, and only from the moment it is.
 *
 * A project's registration is undone by its own conversations dying with it, so there is nothing to
 * unsubscribe here (see RemoteAgent.attach).
 */
internal class RemoteAccessActivity : ProjectActivity {

    override suspend fun execute(project: Project) {
        if (!RemoteAgent.getInstance().enabled()) return

        RemoteAgent.getInstance().attach(project)
    }
}

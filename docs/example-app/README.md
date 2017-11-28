# Example Application Usage

This example application demonstrates the basic usage of the plugin.

Run like so:
```shell
node docs/example-app/index.js
```

Then open in your browser: [http://localhost:5555/](http://localhost:5555/)

The premise of the example app is that the home page is protected and requires authentication. 
When the visitor lands on a page that requires auth, they will be redirected to the login page with a param `next` containing where they should be redirected after authentication.
Once authenticated, they will be redirected to their given page or to the default home page.

There is also a page that will dump what is currently stored in the session, and allow you to modify the value.

Finally, there is a logout mechanism.

With all of these parts put together, you'll end up with everything needed to provide server-side authentication for your app. 
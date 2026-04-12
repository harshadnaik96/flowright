# Flow control and logic overview

While standard Flows represent linear user journeys, real-world testing often requires dynamic behavior. This section covers the tools that allow your tests to adapt to different application states, platform requirements, and data environments.

### Core pillars of Flow architecture

To build scalable tests, you will utilize five pillars:

#### **Selection**

Identify UI elements with precision. Before building the test logic, you must master [how to use Selectors](https://docs.maestro.dev/maestro-flows/flow-control-and-logic/how-to-use-selectors) to ensure Maestro can reliably find and interact with the correct parts of your application screen.

#### **Modularity**

Avoid repeating yourself, you can use [Nested Flows](https://docs.maestro.dev/maestro-flows/flow-control-and-logic/nested-flows) to extract common journeys, like Login or Onboarding, into separate files. You can then call these "subflows" across your entire suite using the `runFlow` command.

#### **Conditional execution**

Not every test step should run every time. [Conditions](https://docs.maestro.dev/maestro-flows/flow-control-and-logic/conditions) allow you to execute actions based on element visibility, platform (iOS vs. Android), or custom JavaScript expressions.

#### **Repetition**&#x20;

Handle dynamic lists or "polling" scenarios with [Loops ](https://docs.maestro.dev/maestro-flows/flow-control-and-logic/loops)to repeat actions until a goal is met. Complement this with [Wait Commands](https://docs.maestro.dev/maestro-flows/flow-control-and-logic/wait-commands) to ensure your tests only proceed when the UI is stable, eliminating flakiness from slow network loads.

#### **Environment and l**ifecycle

Manage test data externally using [parameters and constants](https://docs.maestro.dev/maestro-flows/flow-control-and-logic/parameters-and-constants), allowing the same Flow to run in Staging, QA, or Production. Use [Hooks ](https://docs.maestro.dev/maestro-flows/flow-control-and-logic/hooks)(`onFlowStart`, `onFlowComplete`) to automate setup and teardown tasks, such as clearing app state or granting [Permissions](https://docs.maestro.dev/maestro-flows/flow-control-and-logic/permissions).



---

# Flow control and logic overview

While standard Flows represent linear user journeys, real-world testing often requires dynamic behavior. This section covers the tools that allow your tests to adapt to different application states, platform requirements, and data environments.

### Core pillars of Flow architecture

To build scalable tests, you will utilize five pillars:

#### **Selection**

Identify UI elements with precision. Before building the test logic, you must master [how to use Selectors](https://docs.maestro.dev/maestro-flows/flow-control-and-logic/how-to-use-selectors) to ensure Maestro can reliably find and interact with the correct parts of your application screen.

#### **Modularity**

Avoid repeating yourself, you can use [Nested Flows](https://docs.maestro.dev/maestro-flows/flow-control-and-logic/nested-flows) to extract common journeys, like Login or Onboarding, into separate files. You can then call these "subflows" across your entire suite using the `runFlow` command.

#### **Conditional execution**

Not every test step should run every time. [Conditions](https://docs.maestro.dev/maestro-flows/flow-control-and-logic/conditions) allow you to execute actions based on element visibility, platform (iOS vs. Android), or custom JavaScript expressions.

#### **Repetition**&#x20;

Handle dynamic lists or "polling" scenarios with [Loops ](https://docs.maestro.dev/maestro-flows/flow-control-and-logic/loops)to repeat actions until a goal is met. Complement this with [Wait Commands](https://docs.maestro.dev/maestro-flows/flow-control-and-logic/wait-commands) to ensure your tests only proceed when the UI is stable, eliminating flakiness from slow network loads.

#### **Environment and l**ifecycle

Manage test data externally using [parameters and constants](https://docs.maestro.dev/maestro-flows/flow-control-and-logic/parameters-and-constants), allowing the same Flow to run in Staging, QA, or Production. Use [Hooks ](https://docs.maestro.dev/maestro-flows/flow-control-and-logic/hooks)(`onFlowStart`, `onFlowComplete`) to automate setup and teardown tasks, such as clearing app state or granting [Permissions](https://docs.maestro.dev/maestro-flows/flow-control-and-logic/permissions).

---

# Flow control and logic overview

While standard Flows represent linear user journeys, real-world testing often requires dynamic behavior. This section covers the tools that allow your tests to adapt to different application states, platform requirements, and data environments.

### Core pillars of Flow architecture

To build scalable tests, you will utilize five pillars:

#### **Selection**

Identify UI elements with precision. Before building the test logic, you must master [how to use Selectors](https://docs.maestro.dev/maestro-flows/flow-control-and-logic/how-to-use-selectors) to ensure Maestro can reliably find and interact with the correct parts of your application screen.

#### **Modularity**

Avoid repeating yourself, you can use [Nested Flows](https://docs.maestro.dev/maestro-flows/flow-control-and-logic/nested-flows) to extract common journeys, like Login or Onboarding, into separate files. You can then call these "subflows" across your entire suite using the `runFlow` command.

#### **Conditional execution**

Not every test step should run every time. [Conditions](https://docs.maestro.dev/maestro-flows/flow-control-and-logic/conditions) allow you to execute actions based on element visibility, platform (iOS vs. Android), or custom JavaScript expressions.

#### **Repetition**&#x20;

Handle dynamic lists or "polling" scenarios with [Loops ](https://docs.maestro.dev/maestro-flows/flow-control-and-logic/loops)to repeat actions until a goal is met. Complement this with [Wait Commands](https://docs.maestro.dev/maestro-flows/flow-control-and-logic/wait-commands) to ensure your tests only proceed when the UI is stable, eliminating flakiness from slow network loads.

#### **Environment and l**ifecycle

Manage test data externally using [parameters and constants](https://docs.maestro.dev/maestro-flows/flow-control-and-logic/parameters-and-constants), allowing the same Flow to run in Staging, QA, or Production. Use [Hooks ](https://docs.maestro.dev/maestro-flows/flow-control-and-logic/hooks)(`onFlowStart`, `onFlowComplete`) to automate setup and teardown tasks, such as clearing app state or granting [Permissions](https://docs.maestro.dev/maestro-flows/flow-control-and-logic/permissions).

--- 

# Flow control and logic overview

While standard Flows represent linear user journeys, real-world testing often requires dynamic behavior. This section covers the tools that allow your tests to adapt to different application states, platform requirements, and data environments.

### Core pillars of Flow architecture

To build scalable tests, you will utilize five pillars:

#### **Selection**

Identify UI elements with precision. Before building the test logic, you must master [how to use Selectors](https://docs.maestro.dev/maestro-flows/flow-control-and-logic/how-to-use-selectors) to ensure Maestro can reliably find and interact with the correct parts of your application screen.

#### **Modularity**

Avoid repeating yourself, you can use [Nested Flows](https://docs.maestro.dev/maestro-flows/flow-control-and-logic/nested-flows) to extract common journeys, like Login or Onboarding, into separate files. You can then call these "subflows" across your entire suite using the `runFlow` command.

#### **Conditional execution**

Not every test step should run every time. [Conditions](https://docs.maestro.dev/maestro-flows/flow-control-and-logic/conditions) allow you to execute actions based on element visibility, platform (iOS vs. Android), or custom JavaScript expressions.

#### **Repetition**&#x20;

Handle dynamic lists or "polling" scenarios with [Loops ](https://docs.maestro.dev/maestro-flows/flow-control-and-logic/loops)to repeat actions until a goal is met. Complement this with [Wait Commands](https://docs.maestro.dev/maestro-flows/flow-control-and-logic/wait-commands) to ensure your tests only proceed when the UI is stable, eliminating flakiness from slow network loads.

#### **Environment and l**ifecycle

Manage test data externally using [parameters and constants](https://docs.maestro.dev/maestro-flows/flow-control-and-logic/parameters-and-constants), allowing the same Flow to run in Staging, QA, or Production. Use [Hooks ](https://docs.maestro.dev/maestro-flows/flow-control-and-logic/hooks)(`onFlowStart`, `onFlowComplete`) to automate setup and teardown tasks, such as clearing app state or granting [Permissions](https://docs.maestro.dev/maestro-flows/flow-control-and-logic/permissions).
--
# Flow control and logic overview

While standard Flows represent linear user journeys, real-world testing often requires dynamic behavior. This section covers the tools that allow your tests to adapt to different application states, platform requirements, and data environments.

### Core pillars of Flow architecture

To build scalable tests, you will utilize five pillars:

#### **Selection**

Identify UI elements with precision. Before building the test logic, you must master [how to use Selectors](https://docs.maestro.dev/maestro-flows/flow-control-and-logic/how-to-use-selectors) to ensure Maestro can reliably find and interact with the correct parts of your application screen.

#### **Modularity**

Avoid repeating yourself, you can use [Nested Flows](https://docs.maestro.dev/maestro-flows/flow-control-and-logic/nested-flows) to extract common journeys, like Login or Onboarding, into separate files. You can then call these "subflows" across your entire suite using the `runFlow` command.

#### **Conditional execution**

Not every test step should run every time. [Conditions](https://docs.maestro.dev/maestro-flows/flow-control-and-logic/conditions) allow you to execute actions based on element visibility, platform (iOS vs. Android), or custom JavaScript expressions.

#### **Repetition**&#x20;

Handle dynamic lists or "polling" scenarios with [Loops ](https://docs.maestro.dev/maestro-flows/flow-control-and-logic/loops)to repeat actions until a goal is met. Complement this with [Wait Commands](https://docs.maestro.dev/maestro-flows/flow-control-and-logic/wait-commands) to ensure your tests only proceed when the UI is stable, eliminating flakiness from slow network loads.

#### **Environment and l**ifecycle

Manage test data externally using [parameters and constants](https://docs.maestro.dev/maestro-flows/flow-control-and-logic/parameters-and-constants), allowing the same Flow to run in Staging, QA, or Production. Use [Hooks ](https://docs.maestro.dev/maestro-flows/flow-control-and-logic/hooks)(`onFlowStart`, `onFlowComplete`) to automate setup and teardown tasks, such as clearing app state or granting [Permissions](https://docs.maestro.dev/maestro-flows/flow-control-and-logic/permissions).
---

# Flow control and logic overview

While standard Flows represent linear user journeys, real-world testing often requires dynamic behavior. This section covers the tools that allow your tests to adapt to different application states, platform requirements, and data environments.

### Core pillars of Flow architecture

To build scalable tests, you will utilize five pillars:

#### **Selection**

Identify UI elements with precision. Before building the test logic, you must master [how to use Selectors](https://docs.maestro.dev/maestro-flows/flow-control-and-logic/how-to-use-selectors) to ensure Maestro can reliably find and interact with the correct parts of your application screen.

#### **Modularity**

Avoid repeating yourself, you can use [Nested Flows](https://docs.maestro.dev/maestro-flows/flow-control-and-logic/nested-flows) to extract common journeys, like Login or Onboarding, into separate files. You can then call these "subflows" across your entire suite using the `runFlow` command.

#### **Conditional execution**

Not every test step should run every time. [Conditions](https://docs.maestro.dev/maestro-flows/flow-control-and-logic/conditions) allow you to execute actions based on element visibility, platform (iOS vs. Android), or custom JavaScript expressions.

#### **Repetition**&#x20;

Handle dynamic lists or "polling" scenarios with [Loops ](https://docs.maestro.dev/maestro-flows/flow-control-and-logic/loops)to repeat actions until a goal is met. Complement this with [Wait Commands](https://docs.maestro.dev/maestro-flows/flow-control-and-logic/wait-commands) to ensure your tests only proceed when the UI is stable, eliminating flakiness from slow network loads.

#### **Environment and l**ifecycle

Manage test data externally using [parameters and constants](https://docs.maestro.dev/maestro-flows/flow-control-and-logic/parameters-and-constants), allowing the same Flow to run in Staging, QA, or Production. Use [Hooks ](https://docs.maestro.dev/maestro-flows/flow-control-and-logic/hooks)(`onFlowStart`, `onFlowComplete`) to automate setup and teardown tasks, such as clearing app state or granting [Permissions](https://docs.maestro.dev/maestro-flows/flow-control-and-logic/permissions).

--

# Flow control and logic overview

While standard Flows represent linear user journeys, real-world testing often requires dynamic behavior. This section covers the tools that allow your tests to adapt to different application states, platform requirements, and data environments.

### Core pillars of Flow architecture

To build scalable tests, you will utilize five pillars:

#### **Selection**

Identify UI elements with precision. Before building the test logic, you must master [how to use Selectors](https://docs.maestro.dev/maestro-flows/flow-control-and-logic/how-to-use-selectors) to ensure Maestro can reliably find and interact with the correct parts of your application screen.

#### **Modularity**

Avoid repeating yourself, you can use [Nested Flows](https://docs.maestro.dev/maestro-flows/flow-control-and-logic/nested-flows) to extract common journeys, like Login or Onboarding, into separate files. You can then call these "subflows" across your entire suite using the `runFlow` command.

#### **Conditional execution**

Not every test step should run every time. [Conditions](https://docs.maestro.dev/maestro-flows/flow-control-and-logic/conditions) allow you to execute actions based on element visibility, platform (iOS vs. Android), or custom JavaScript expressions.

#### **Repetition**&#x20;

Handle dynamic lists or "polling" scenarios with [Loops ](https://docs.maestro.dev/maestro-flows/flow-control-and-logic/loops)to repeat actions until a goal is met. Complement this with [Wait Commands](https://docs.maestro.dev/maestro-flows/flow-control-and-logic/wait-commands) to ensure your tests only proceed when the UI is stable, eliminating flakiness from slow network loads.

#### **Environment and l**ifecycle

Manage test data externally using [parameters and constants](https://docs.maestro.dev/maestro-flows/flow-control-and-logic/parameters-and-constants), allowing the same Flow to run in Staging, QA, or Production. Use [Hooks ](https://docs.maestro.dev/maestro-flows/flow-control-and-logic/hooks)(`onFlowStart`, `onFlowComplete`) to automate setup and teardown tasks, such as clearing app state or granting [Permissions](https://docs.maestro.dev/maestro-flows/flow-control-and-logic/permissions).

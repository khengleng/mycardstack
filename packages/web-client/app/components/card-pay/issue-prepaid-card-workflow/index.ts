import Component from '@glimmer/component';
import { getOwner } from '@ember/application';
import { WorkflowMessage } from '@cardstack/web-client/models/workflow/workflow-message';
import { Workflow, cardbot } from '@cardstack/web-client/models/workflow';
import { Milestone } from '@cardstack/web-client/models/workflow/milestone';
import { WorkflowCard } from '@cardstack/web-client/models/workflow/workflow-card';
import PostableCollection from '@cardstack/web-client/models/workflow/postable-collection';
import NetworkAwareWorkflowMessage from '@cardstack/web-client/components/workflow-thread/network-aware-message';

class IssuePrepaidCardWorkflow extends Workflow {
  name = 'Prepaid Card Issuance';
  milestones = [
    new Milestone({
      title: 'Connect xDai chain wallet',
      postables: [
        new WorkflowMessage({
          author: cardbot,
          message: `Hello, it’s nice to see you!`,
        }),
        new WorkflowMessage({
          author: cardbot,
          message: `Let’s issue a prepaid card.`,
        }),
        new NetworkAwareWorkflowMessage({
          author: cardbot,
          message: `Looks like you've already connected your xDai chain wallet, which you can see below.
          Please continue with the next step of this workflow.`,
          includeIf() {
            return (this as NetworkAwareWorkflowMessage).hasLayer2Account;
          },
        }),
        new NetworkAwareWorkflowMessage({
          author: cardbot,
          message: `Before we get started, please connect your xDai chain wallet via your Cardstack mobile app.  If you don’t have the app installed, please do so now.`,
          includeIf() {
            return !(this as NetworkAwareWorkflowMessage).hasLayer2Account;
          },
        }),
        new NetworkAwareWorkflowMessage({
          author: cardbot,
          message: `Once you have installed the app, open the app and add an existing wallet/account or create a new wallet/account. Use your account to scan this QR code, which will connect your account with Card Pay.`,
          includeIf() {
            return !(this as NetworkAwareWorkflowMessage).hasLayer2Account;
          },
        }),
        new WorkflowCard({
          author: cardbot,
          componentName: 'card-pay/layer-two-connect-card',
        }),
      ],
      completedDetail: 'xDai Chain wallet connected',
    }),
    new Milestone({
      title: 'Customize layout',
      postables: [
        new WorkflowMessage({
          author: cardbot,
          message:
            'Let’s get started! First, you can choose the look and feel of your card, so that your customers and other users recognize that this prepaid card came from you.',
        }),
        new WorkflowCard({
          author: cardbot,
          componentName:
            'card-pay/issue-prepaid-card-workflow/layout-customization',
        }),
      ],
      completedDetail: 'Layout customized',
    }),
    new Milestone({
      title: 'Choose face value',
      postables: [
        new WorkflowMessage({
          author: cardbot,
          message: 'Nice choice!',
        }),
        new WorkflowMessage({
          author: cardbot,
          message:
            'On to the next step: How do you want to fund your prepaid card? Please select a depot and balance from your xDai chain wallet.',
        }),
        new WorkflowCard({
          author: cardbot,
          componentName: 'card-pay/issue-prepaid-card-workflow/funding-source',
        }),
        new WorkflowMessage({
          author: cardbot,
          message: `When you choose the face value of your prepaid card, you may want to consider creating one card with a larger balance,
            as opposed to several cards with smaller balances (which would require a separate transaction, incl. fees, for each card).
            After you have created your card, you can split it up into multiple cards with smaller balances to transfer to your customers.`,
        }),
        new WorkflowCard({
          author: cardbot,
          componentName: 'card-pay/issue-prepaid-card-workflow/face-value',
        }),
      ],
      completedDetail: 'Face value chosen',
    }),
    new Milestone({
      title: 'Confirm transaction',
      postables: [
        new WorkflowMessage({
          author: cardbot,
          message: `This is what your prepaid card will look like. 
            Now, we just need your confirmation to create the card.`,
        }),
        new WorkflowCard({
          author: cardbot,
          componentName: 'card-pay/issue-prepaid-card-workflow/preview',
        }),
      ],
      completedDetail: 'Transaction confirmed',
    }),
  ];
  epilogue = new PostableCollection([
    new WorkflowMessage({
      author: cardbot,
      message:
        'Congratulations, you have created a prepaid card! This prepaid card has been added to your xDai chain wallet.',
    }),
    new WorkflowCard({
      author: cardbot,
      componentName: 'card-pay/issue-prepaid-card-workflow/confirmation',
    }),
    new WorkflowMessage({
      author: cardbot,
      message: 'This is the remaining balance in your xDai chain wallet:',
    }),
    new WorkflowCard({
      author: cardbot,
      componentName: 'card-pay/layer-two-connect-card',
    }),
    new WorkflowCard({
      author: cardbot,
      componentName: 'card-pay/issue-prepaid-card-workflow/next-steps',
    }),
  ]);
  constructor(owner: unknown) {
    super(owner);
    this.attachWorkflow();
  }
}

class IssuePrepaidCardWorkflowComponent extends Component {
  workflow!: IssuePrepaidCardWorkflow;
  constructor(owner: unknown, args: {}) {
    super(owner, args);
    this.workflow = new IssuePrepaidCardWorkflow(getOwner(this));
  }
}

export default IssuePrepaidCardWorkflowComponent;
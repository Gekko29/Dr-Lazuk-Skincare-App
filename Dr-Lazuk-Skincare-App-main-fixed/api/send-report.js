// You'll need to add an email service (SendGrid, Resend, etc.)
// For now, this is a placeholder that logs the email

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { report, recommendedProducts, recommendedServices, userInfo } = req.body;
  
  console.log('=== EMAIL NOTIFICATION ===');
  console.log('To: contact@skindoctor.ai');
  console.log('Subject: New Skincare Prospect');
  console.log('User Email:', userInfo.email);
  console.log('User Age:', userInfo.age);
  console.log('User Concern:', userInfo.concern);
  console.log('========================');

  // TODO: Integrate with SendGrid or Resend here
  // Example with SendGrid:
  // const sgMail = require('@sendgrid/mail');
  // sgMail.setApiKey(process.env.SENDGRID_API_KEY);
  // await sgMail.send({ to: 'contact@skindoctor.ai', from: '...', subject: '...', html: '...' });

  res.status(200).json({ success: true, message: 'Email sent' });
}

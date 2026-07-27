const fs = require('fs');
const files = ['en.json', 'es.json', 'fr.json'];
const translations = {
  en: {
    dashboard: {
      title: "Clinical Overview",
      welcomePrefix: "Welcome back,",
      welcomeSuffix: "Here is what is happening today.",
      activePatients: "Active Patients",
      pendingReviews: "Pending Reviews",
      staffAvailable: "Staff Available",
      noData: "No data yet",
      recentActivity: "Recent Patient Activity",
      noRecentActivity: "No recent activity. Client records live encrypted in your vault — open Clients to begin."
    }
  },
  es: {
    dashboard: {
      title: "Resumen Clínico",
      welcomePrefix: "Bienvenido,",
      welcomeSuffix: "Esto es lo que está pasando hoy.",
      activePatients: "Pacientes Activos",
      pendingReviews: "Revisiones Pendientes",
      staffAvailable: "Personal Disponible",
      noData: "Aún no hay datos",
      recentActivity: "Actividad Reciente del Paciente",
      noRecentActivity: "No hay actividad reciente. Los registros de los clientes viven encriptados en su bóveda — abra Clientes para comenzar."
    }
  },
  fr: {
    dashboard: {
      title: "Aperçu Clinique",
      welcomePrefix: "Bon retour,",
      welcomeSuffix: "Voici ce qui se passe aujourd'hui.",
      activePatients: "Patients Actifs",
      pendingReviews: "Examens en Attente",
      staffAvailable: "Personnel Disponible",
      noData: "Aucune donnée",
      recentActivity: "Activité Récente du Patient",
      noRecentActivity: "Aucune activité récente. Les dossiers des clients vivent cryptés dans votre chambre forte — ouvrez Clients pour commencer."
    }
  }
};

for (const file of files) {
  const lang = file.split('.')[0];
  const path = '/home/aziza/injusticereformnetwork/src/i18n/locales/' + file;
  const data = JSON.parse(fs.readFileSync(path, 'utf8'));
  data.dashboard = translations[lang].dashboard;
  fs.writeFileSync(path, JSON.stringify(data, null, 2) + '\n');
}

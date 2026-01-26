import { PrismaClient, UserRole, TableStatus, ReservationStatus, OrderStatus, CourseType, PaymentMethod, TipMethod } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting database seeding...');

  // Clean existing data (for development only!)
  console.log('🧹 Cleaning database...');
  await prisma.endOfDayClose.deleteMany({});
  await prisma.businessDay.deleteMany({});
  await prisma.tip.deleteMany({});
  await prisma.serviceCharge.deleteMany({});
  await prisma.payment.deleteMany({});
  await prisma.receipt.deleteMany({});
  await prisma.orderItem.deleteMany({});
  await prisma.orderCourse.deleteMany({});
  await prisma.order.deleteMany({});
  await prisma.reservation.deleteMany({});
  await prisma.table.deleteMany({});
  await prisma.shift.deleteMany({});
  await prisma.wineDetail.deleteMany({});
  await prisma.stockMovement.deleteMany({});
  await prisma.inventoryItem.deleteMany({});
  await prisma.supplier.deleteMany({});
  await prisma.menuItem.deleteMany({});
  await prisma.menuSection.deleteMany({});
  await prisma.menu.deleteMany({});
  await prisma.kitchenStation.deleteMany({});
  await prisma.user.deleteMany({});
  await prisma.location.deleteMany({});
  await prisma.activityLog.deleteMany({});
  await prisma.notification.deleteMany({});
  await prisma.financialSetting.deleteMany({});
  await prisma.tenant.deleteMany({});

  // Create Tenant (Restaurant Group)
  console.log('🏢 Creating tenant...');
  const tenant = await prisma.tenant.create({
    data: {
      name: 'Michelin Restaurant Group',
      isActive: true,
    },
  });

  // Create Location (Individual Restaurant)
  console.log('📍 Creating location...');
  const location = await prisma.location.create({
    data: {
      tenantId: tenant.id,
      name: 'Downtown Fine Dining',
      address: '123 Main Street, San Francisco, CA 94102',
      isActive: true,
    },
  });

  // Create Kitchen Stations
  console.log('🔪 Creating kitchen stations...');
  const stations = await Promise.all([
    prisma.kitchenStation.create({
      data: {
        tenantId: tenant.id,
        locationId: location.id,
        name: 'Grill Station',
      },
    }),
    prisma.kitchenStation.create({
      data: {
        tenantId: tenant.id,
        locationId: location.id,
        name: 'Pastry & Dessert',
      },
    }),
    prisma.kitchenStation.create({
      data: {
        tenantId: tenant.id,
        locationId: location.id,
        name: 'Garde Manger (Cold)',
      },
    }),
    prisma.kitchenStation.create({
      data: {
        tenantId: tenant.id,
        locationId: location.id,
        name: 'Sauce & Hot Station',
      },
    }),
  ]);

  // Create Users (Staff)
  console.log('👥 Creating users...');
  const users = await Promise.all([
    prisma.user.create({
      data: {
        tenantId: tenant.id,
        locationId: location.id,
        email: 'owner@blackpot.com',
        name: 'Owner',
        passwordHash: '$2b$10$example', // Placeholder - should be hashed password
        role: UserRole.OWNER,
        isActive: true,
      },
    }),
    prisma.user.create({
      data: {
        tenantId: tenant.id,
        locationId: location.id,
        email: 'manager1@blackpot.com',
        name: 'Manager 1',
        passwordHash: '$2b$10$example',
        role: UserRole.MANAGER,
        isActive: true,
      },
    }),
    prisma.user.create({
      data: {
        tenantId: tenant.id,
        locationId: location.id,
        email: 'manager2@blackpot.com',
        name: 'Manager 2',
        passwordHash: '$2b$10$example',
        role: UserRole.MANAGER,
        isActive: true,
      },
    }),
    prisma.user.create({
      data: {
        tenantId: tenant.id,
        locationId: location.id,
        email: 'server1@blackpot.com',
        name: 'Alex Johnson (Server)',
        passwordHash: '$2b$10$example',
        role: UserRole.SERVER,
        isActive: true,
      },
    }),
    prisma.user.create({
      data: {
        tenantId: tenant.id,
        locationId: location.id,
        email: 'server2@blackpot.com',
        name: 'Jordan Williams (Server)',
        passwordHash: '$2b$10$example',
        role: UserRole.SERVER,
        isActive: true,
      },
    }),
    prisma.user.create({
      data: {
        tenantId: tenant.id,
        locationId: location.id,
        email: 'server3@blackpot.com',
        name: 'Casey Lee (Server)',
        passwordHash: '$2b$10$example',
        role: UserRole.SERVER,
        isActive: true,
      },
    }),
    prisma.user.create({
      data: {
        tenantId: tenant.id,
        locationId: location.id,
        email: 'server4@blackpot.com',
        name: 'Morgan Davis (Server)',
        passwordHash: '$2b$10$example',
        role: UserRole.SERVER,
        isActive: true,
      },
    }),
    prisma.user.create({
      data: {
        tenantId: tenant.id,
        locationId: location.id,
        email: 'server5@blackpot.com',
        name: 'Riley Martinez (Server)',
        passwordHash: '$2b$10$example',
        role: UserRole.SERVER,
        isActive: true,
      },
    }),
    prisma.user.create({
      data: {
        tenantId: tenant.id,
        locationId: location.id,
        email: 'host@blackpot.com',
        name: 'Sam Taylor (Host)',
        passwordHash: '$2b$10$example',
        role: UserRole.HOST,
        isActive: true,
      },
    }),
    prisma.user.create({
      data: {
        tenantId: tenant.id,
        locationId: location.id,
        email: 'chef@blackpot.com',
        name: 'Executive Chef',
        passwordHash: '$2b$10$example',
        role: UserRole.CHEF,
        isActive: true,
      },
    }),
    prisma.user.create({
      data: {
        tenantId: tenant.id,
        locationId: location.id,
        email: 'sous1@blackpot.com',
        name: 'Sous Chef 1',
        passwordHash: '$2b$10$example',
        role: UserRole.CHEF,
        isActive: true,
      },
    }),
    prisma.user.create({
      data: {
        tenantId: tenant.id,
        locationId: location.id,
        email: 'sous2@blackpot.com',
        name: 'Sous Chef 2',
        passwordHash: '$2b$10$example',
        role: UserRole.CHEF,
        isActive: true,
      },
    }),
    prisma.user.create({
      data: {
        tenantId: tenant.id,
        locationId: location.id,
        email: 'sommelier@blackpot.com',
        name: 'Wine Sommelier',
        passwordHash: '$2b$10$example',
        role: UserRole.SOMMELIER,
        isActive: true,
      },
    }),
  ]);

  // Create Tables
  console.log('🪑 Creating tables...');
  const tableConfigs = [
    { name: 'Table 1', capacity: 2, x: 1, y: 1, width: 0.8, height: 0.8 },
    { name: 'Table 2', capacity: 2, x: 2.5, y: 1, width: 0.8, height: 0.8 },
    { name: 'Table 3', capacity: 4, x: 4, y: 1, width: 1.2, height: 1.2 },
    { name: 'Table 4', capacity: 4, x: 5.5, y: 1, width: 1.2, height: 1.2 },
    { name: 'Table 5', capacity: 4, x: 1, y: 2.5, width: 1.2, height: 1.2 },
    { name: 'Table 6', capacity: 6, x: 2.5, y: 2.5, width: 1.5, height: 1.5 },
    { name: 'Table 7', capacity: 6, x: 4.5, y: 2.5, width: 1.5, height: 1.5 },
    { name: 'Table 8', capacity: 4, x: 1, y: 4.5, width: 1.2, height: 1.2 },
    { name: 'Table 9', capacity: 4, x: 2.5, y: 4.5, width: 1.2, height: 1.2 },
    { name: 'Table 10', capacity: 8, x: 4.5, y: 4.5, width: 2, height: 2 },
    { name: 'Bar Seat 1', capacity: 1, x: 0.2, y: 0.2, width: 0.4, height: 0.4 },
    { name: 'Bar Seat 2', capacity: 1, x: 0.7, y: 0.2, width: 0.4, height: 0.4 },
    { name: 'Bar Seat 3', capacity: 1, x: 1.2, y: 0.2, width: 0.4, height: 0.4 },
    { name: 'Patio Table 1', capacity: 6, x: 6.5, y: 3, width: 1.5, height: 1.5 },
    { name: 'Patio Table 2', capacity: 6, x: 8, y: 3, width: 1.5, height: 1.5 },
  ];

  const tables = await Promise.all(
    tableConfigs.map((config) =>
      prisma.table.create({
        data: {
          tenantId: tenant.id,
          locationId: location.id,
          name: config.name,
          capacity: config.capacity,
          status: TableStatus.AVAILABLE,
          x: config.x,
          y: config.y,
          width: config.width,
          height: config.height,
        },
      }),
    ),
  );

  // Create Menu
  console.log('📋 Creating menu...');
  const menu = await prisma.menu.create({
    data: {
      tenantId: tenant.id,
      name: 'Seasonal Tasting Menu',
      version: 1,
      isActive: true,
      sections: {
        create: [
          {
            tenantId: tenant.id,
            name: 'Amuse Bouche',
            position: 1,
          },
          {
            tenantId: tenant.id,
            name: 'Appetizers',
            position: 2,
          },
          {
            tenantId: tenant.id,
            name: 'Soups & Salads',
            position: 3,
          },
          {
            tenantId: tenant.id,
            name: 'Main Courses',
            position: 4,
          },
          {
            tenantId: tenant.id,
            name: 'Cheese Course',
            position: 5,
          },
          {
            tenantId: tenant.id,
            name: 'Desserts',
            position: 6,
          },
          {
            tenantId: tenant.id,
            name: 'Petit Fours & Digestif',
            position: 7,
          },
        ],
      },
    },
  });

  // Get sections for menu items
  const sections = await prisma.menuSection.findMany({
    where: { menuId: menu.id },
  });

  // Create Menu Items
  console.log('🍽️ Creating menu items...');
  const amuse = sections.find((s) => s.name === 'Amuse Bouche')!;
  const appetizers = sections.find((s) => s.name === 'Appetizers')!;
  const soups = sections.find((s) => s.name === 'Soups & Salads')!;
  const mains = sections.find((s) => s.name === 'Main Courses')!;
  const cheese = sections.find((s) => s.name === 'Cheese Course')!;
  const desserts = sections.find((s) => s.name === 'Desserts')!;
  const digestif = sections.find((s) => s.name === 'Petit Fours & Digestif')!;

  const menuItems = await Promise.all([
    // Amuse Bouche
    prisma.menuItem.create({
      data: {
        tenantId: tenant.id,
        sectionId: amuse.id,
        name: "Foie Gras Mousse on Brioche",
        description: "Smooth foie gras mousse with crispy brioche toast",
        price: new Decimal('0'),
        isAvailable: true,
      },
    }),
    // Appetizers
    prisma.menuItem.create({
      data: {
        tenantId: tenant.id,
        sectionId: appetizers.id,
        name: "Oysters 3 Ways",
        description: "Fresh oysters prepared classically, mignonette, and tempura",
        price: new Decimal('24.00'),
        isAvailable: true,
      },
    }),
    prisma.menuItem.create({
      data: {
        tenantId: tenant.id,
        sectionId: appetizers.id,
        name: "Seared Diver Scallops",
        description: "Pan-seared with brown butter, capers, and lemon beurre blanc",
        price: new Decimal('28.00'),
        isAvailable: true,
      },
    }),
    prisma.menuItem.create({
      data: {
        tenantId: tenant.id,
        sectionId: appetizers.id,
        name: "Cured Hamachi",
        description: "Thinly sliced with yuzu kosho, micro cilantro",
        price: new Decimal('22.00'),
        isAvailable: true,
      },
    }),
    // Soups & Salads
    prisma.menuItem.create({
      data: {
        tenantId: tenant.id,
        sectionId: soups.id,
        name: "Lobster Bisque",
        description: "Creamy lobster bisque with cognac foam",
        price: new Decimal('18.00'),
        isAvailable: true,
      },
    }),
    prisma.menuItem.create({
      data: {
        tenantId: tenant.id,
        sectionId: soups.id,
        name: "Caesar Salad",
        description: "Romaine, house-made croutons, parmesan, Caesar dressing",
        price: new Decimal('16.00'),
        isAvailable: true,
      },
    }),
    prisma.menuItem.create({
      data: {
        tenantId: tenant.id,
        sectionId: soups.id,
        name: "Heirloom Tomato Salad",
        description: "Mixed heirloom tomatoes, burrata, basil oil, aged balsamic",
        price: new Decimal('19.00'),
        isAvailable: true,
      },
    }),
    // Main Courses
    prisma.menuItem.create({
      data: {
        tenantId: tenant.id,
        sectionId: mains.id,
        name: "Pan-Seared Ribeye",
        description: "14oz dry-aged ribeye, charred onion, bone marrow jus",
        price: new Decimal('54.00'),
        isAvailable: true,
      },
    }),
    prisma.menuItem.create({
      data: {
        tenantId: tenant.id,
        sectionId: mains.id,
        name: "Dover Sole Meunière",
        description: "Whole dover sole, brown butter, capers, lemon",
        price: new Decimal('52.00'),
        isAvailable: true,
      },
    }),
    prisma.menuItem.create({
      data: {
        tenantId: tenant.id,
        sectionId: mains.id,
        name: "Duck Breast",
        description: "Pekin duck breast, cherry gastrique, salsify",
        price: new Decimal('48.00'),
        isAvailable: true,
      },
    }),
    prisma.menuItem.create({
      data: {
        tenantId: tenant.id,
        sectionId: mains.id,
        name: "Rack of Lamb",
        description: "Herb-crusted lamb, jus, seasonal vegetables",
        price: new Decimal('52.00'),
        isAvailable: true,
      },
    }),
    // Cheese Course
    prisma.menuItem.create({
      data: {
        tenantId: tenant.id,
        sectionId: cheese.id,
        name: "Cheese Selection",
        description: "Five artisanal cheeses with house-made crackers",
        price: new Decimal('28.00'),
        isAvailable: true,
      },
    }),
    // Desserts
    prisma.menuItem.create({
      data: {
        tenantId: tenant.id,
        sectionId: desserts.id,
        name: "Valrhona Chocolate Soufflé",
        description: "Dark chocolate soufflé with warm chocolate sauce",
        price: new Decimal('16.00'),
        isAvailable: true,
      },
    }),
    prisma.menuItem.create({
      data: {
        tenantId: tenant.id,
        sectionId: desserts.id,
        name: "Lemon Tart",
        description: "Crispy pastry, lemon curd, Italian meringue",
        price: new Decimal('14.00'),
        isAvailable: true,
      },
    }),
    prisma.menuItem.create({
      data: {
        tenantId: tenant.id,
        sectionId: desserts.id,
        name: "Crème Brûlée",
        description: "Classic vanilla bean crème brûlée with caramelized sugar",
        price: new Decimal('12.00'),
        isAvailable: true,
      },
    }),
    // Petit Fours
    prisma.menuItem.create({
      data: {
        tenantId: tenant.id,
        sectionId: digestif.id,
        name: "Petit Fours Assortment",
        description: "Selection of macarons, chocolates, and miniature pastries",
        price: new Decimal('0'),
        isAvailable: true,
      },
    }),
  ]);

  // Create Financial Settings
  console.log('💰 Creating financial settings...');
  await prisma.financialSetting.create({
    data: {
      tenantId: tenant.id,
      taxRate: new Decimal('0.0825'), // 8.25% tax
      serviceChargeRate: new Decimal('0.18'), // 18% service charge for large parties
      currency: 'USD',
      roundingStrategy: 'ROUND_HALF_UP',
    },
  });

  // Create Reservations for next 7 days
  console.log('📅 Creating reservations...');
  const now = new Date();
  const reservationPromises = [];

  for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
    const reservationDate = new Date(now);
    reservationDate.setDate(reservationDate.getDate() + dayOffset);
    reservationDate.setHours(19, 0, 0, 0); // 7 PM

    for (let i = 0; i < 3; i++) {
      const time = new Date(reservationDate);
      time.setHours(19 + i, 0, 0, 0);

      reservationPromises.push(
        prisma.reservation.create({
          data: {
            tenantId: tenant.id,
            tableId: tables[Math.floor(Math.random() * 8)].id, // Random 2-4 person table
            guestCount: 2 + Math.floor(Math.random() * 3),
            guestName: `Guest ${dayOffset}-${i}`,
            guestEmail: `guest${dayOffset}${i}@example.com`,
            guestPhone: '+1-555-0100',
            reservedAt: time,
            status: ReservationStatus.CONFIRMED,
          },
        }),
      );
    }
  }

  await Promise.all(reservationPromises);

  // Create Business Days for last 30 days
  console.log('📊 Creating business days...');
  const businessDays = [];
  for (let i = 30; i >= 0; i--) {
    const date = new Date(now);
    date.setDate(date.getDate() - i);
    date.setHours(0, 0, 0, 0);

    const bd = await prisma.businessDay.create({
      data: {
        tenantId: tenant.id,
        date: date,
        status: 'CLOSED',
      },
    });
    businessDays.push(bd);
  }

  // Create sample Orders (last 30 days)
  console.log('📝 Creating sample orders...');
  for (let orderIdx = 0; orderIdx < 50; orderIdx++) {
    const randomDayOffset = Math.floor(Math.random() * 30);
    const randomDay = businessDays[randomDayOffset];
    const randomTable = tables[Math.floor(Math.random() * tables.length)];
    const randomServer = users.filter((u) => u.role === UserRole.SERVER)[
      Math.floor(Math.random() * 5)
    ];

    const order = await prisma.order.create({
      data: {
        tenantId: tenant.id,
        tableId: randomTable.id,
        serverId: randomServer.id,
        status: OrderStatus.COMPLETED,
        guestCount: randomTable.capacity <= 2 ? 2 : 2 + Math.floor(Math.random() * 4),
        openedAt: new Date(randomDay.date.getTime() + Math.random() * 12 * 60 * 60 * 1000),
        closedAt: new Date(randomDay.date.getTime() + (2 + Math.random() * 2) * 60 * 60 * 1000),
        deletedAt: null,
      },
    });

    // Add courses to order
    const courseTypes = [CourseType.APPETIZER, CourseType.MAIN, CourseType.DESSERT];
    for (let courseIdx = 0; courseIdx < courseTypes.length; courseIdx++) {
      const course = await prisma.orderCourse.create({
        data: {
          tenantId: tenant.id,
          orderId: order.id,
          courseType: courseTypes[courseIdx],
          kitchenStationId: stations[Math.floor(Math.random() * stations.length)].id,
          firedAt: new Date(order.openedAt.getTime() + courseIdx * 20 * 60 * 1000),
          completedAt: new Date(order.openedAt.getTime() + (courseIdx * 20 + 15) * 60 * 1000),
        },
      });

      // Add items to course
      const itemCount = 1 + Math.floor(Math.random() * 3);
      for (let itemIdx = 0; itemIdx < itemCount; itemIdx++) {
        await prisma.orderItem.create({
          data: {
            tenantId: tenant.id,
            orderCourseId: course.id,
            menuItemId: menuItems[Math.floor(Math.random() * menuItems.length)].id,
            quantity: 1 + Math.floor(Math.random() * 2),
            specialNotes: Math.random() > 0.7 ? 'No nuts, please' : null,
            preparedAt: new Date(course.firedAt!.getTime() + 10 * 60 * 1000),
            servedAt: new Date(course.completedAt!.getTime() + 2 * 60 * 1000),
          },
        });
      }
    }

    // Add payment
    const subtotal = 150 + Math.random() * 250;
    const payment = await prisma.payment.create({
      data: {
        tenantId: tenant.id,
        orderId: order.id,
        amount: new Decimal(subtotal.toFixed(2)),
        method: [PaymentMethod.CARD, PaymentMethod.CASH][Math.floor(Math.random() * 2)],
        status: 'COMPLETED',
      },
    });

    // Add tip (if card payment)
    if (payment.method === PaymentMethod.CARD && Math.random() > 0.2) {
      const tipAmount = new Decimal((subtotal * (0.15 + Math.random() * 0.1)).toFixed(2));
      await prisma.tip.create({
        data: {
          tenantId: tenant.id,
          orderId: order.id,
          serverId: randomServer.id,
          amount: tipAmount,
          method: TipMethod.ADDED_TO_BILL,
        },
      });
    }

    // Add end of day close
    if (orderIdx === 49) {
      // Only for last business day
      const totalSales = new Decimal('8500.00');
      await prisma.endOfDayClose.create({
        data: {
          tenantId: tenant.id,
          businessDayId: businessDays[0].id,
          closedByUserId: users[0].id, // Owner
          totalSales: totalSales,
          cashExpected: new Decimal('1200.00'),
          cashActual: new Decimal('1210.00'),
          discrepancy: new Decimal('10.00'),
          notes: 'Small overage in tips',
        },
      });
    }
  }

  // Create Suppliers
  console.log('🚚 Creating suppliers...');
  const suppliers = await Promise.all([
    prisma.supplier.create({
      data: {
        tenantId: tenant.id,
        name: 'Premium Wine Importers',
        contact: '+1-555-WINE-1',
      },
    }),
    prisma.supplier.create({
      data: {
        tenantId: tenant.id,
        name: 'Local Organic Farms',
        contact: '+1-555-FARM-2',
      },
    }),
    prisma.supplier.create({
      data: {
        tenantId: tenant.id,
        name: 'Seafood Distributors International',
        contact: '+1-555-FISH-3',
      },
    }),
    prisma.supplier.create({
      data: {
        tenantId: tenant.id,
        name: 'Specialty Meat Company',
        contact: '+1-555-MEAT-4',
      },
    }),
  ]);

  // Create Inventory Items (100 items)
  console.log('🍇 Creating inventory items...');
  const inventoryItems = [];

  // Wine cellar (30 wines)
  const wines = [
    { name: 'Château Margaux 2015', category: 'wine', unit: 'bottle', supplier: suppliers[0] },
    { name: 'Barolo DOCG 2016', category: 'wine', unit: 'bottle', supplier: suppliers[0] },
    { name: 'Puligny-Montrachet 2018', category: 'wine', unit: 'bottle', supplier: suppliers[0] },
    { name: 'Brunello di Montalcino 2014', category: 'wine', unit: 'bottle', supplier: suppliers[0] },
    { name: 'Châteauneuf-du-Pape 2017', category: 'wine', unit: 'bottle', supplier: suppliers[0] },
    { name: 'Kosta Browne Pinot Noir 2019', category: 'wine', unit: 'bottle', supplier: suppliers[0] },
    { name: 'Silver Oak Cabernet 2017', category: 'wine', unit: 'bottle', supplier: suppliers[0] },
    { name: 'Opus One 2017', category: 'wine', unit: 'bottle', supplier: suppliers[0] },
    { name: 'Screaming Eagle Cabernet 2018', category: 'wine', unit: 'bottle', supplier: suppliers[0] },
    { name: 'Cloudy Bay Sauvignon Blanc', category: 'wine', unit: 'bottle', supplier: suppliers[0] },
    { name: 'Champagne Cristal 2012', category: 'wine', unit: 'bottle', supplier: suppliers[0] },
    { name: 'Dom Pérignon 2012', category: 'wine', unit: 'bottle', supplier: suppliers[0] },
    { name: 'Krug Clos d\'Ambonnay', category: 'wine', unit: 'bottle', supplier: suppliers[0] },
    { name: 'Billecart-Salmon Rosé NV', category: 'wine', unit: 'bottle', supplier: suppliers[0] },
    { name: 'Grappa di Barolo', category: 'wine', unit: 'bottle', supplier: suppliers[0] },
    { name: 'Cognac XO Réserve', category: 'wine', unit: 'bottle', supplier: suppliers[0] },
    { name: 'Macallan 18yr Single Malt', category: 'wine', unit: 'bottle', supplier: suppliers[0] },
    { name: 'Limoncello di Amalfi', category: 'wine', unit: 'bottle', supplier: suppliers[0] },
    { name: 'Pernod Absinthe', category: 'wine', unit: 'bottle', supplier: suppliers[0] },
    { name: 'Patron Silver Tequila', category: 'wine', unit: 'bottle', supplier: suppliers[0] },
    { name: 'Belvedere Vodka', category: 'beverage', unit: 'bottle', supplier: suppliers[0] },
    { name: 'Tanqueray Gin', category: 'beverage', unit: 'bottle', supplier: suppliers[0] },
    { name: 'Bacardi Rum', category: 'beverage', unit: 'bottle', supplier: suppliers[0] },
    { name: 'Hendricks Gin', category: 'beverage', unit: 'bottle', supplier: suppliers[0] },
    { name: 'Grey Goose Vodka', category: 'beverage', unit: 'bottle', supplier: suppliers[0] },
    { name: 'Bombay Sapphire', category: 'beverage', unit: 'bottle', supplier: suppliers[0] },
    { name: 'Ketel One Vodka', category: 'beverage', unit: 'bottle', supplier: suppliers[0] },
    { name: 'Johnnie Walker Blue', category: 'wine', unit: 'bottle', supplier: suppliers[0] },
    { name: 'Glenlivet 15yr', category: 'wine', unit: 'bottle', supplier: suppliers[0] },
    { name: 'Yamazaki 12yr', category: 'wine', unit: 'bottle', supplier: suppliers[0] },
  ];

  // Produce (30 items)
  const produce = [
    { name: 'Fresh Basil', category: 'food', unit: 'bunch', supplier: suppliers[1] },
    { name: 'Heirloom Tomatoes', category: 'food', unit: 'lb', supplier: suppliers[1] },
    { name: 'Baby Arugula', category: 'food', unit: 'oz', supplier: suppliers[1] },
    { name: 'Microgreens Mix', category: 'food', unit: 'oz', supplier: suppliers[1] },
    { name: 'French Shallots', category: 'food', unit: 'lb', supplier: suppliers[1] },
    { name: 'Garlic Cloves', category: 'food', unit: 'lb', supplier: suppliers[1] },
    { name: 'Chanterelle Mushrooms', category: 'food', unit: 'oz', supplier: suppliers[1] },
    { name: 'Porcini Mushrooms', category: 'food', unit: 'oz', supplier: suppliers[1] },
    { name: 'Truffle Oil', category: 'food', unit: 'bottle', supplier: suppliers[1] },
    { name: 'White Truffles', category: 'food', unit: 'oz', supplier: suppliers[1] },
    { name: 'Saffron Threads', category: 'food', unit: 'gram', supplier: suppliers[1] },
    { name: 'Vanilla Beans', category: 'food', unit: 'piece', supplier: suppliers[1] },
    { name: 'Fresh Caviar', category: 'food', unit: 'oz', supplier: suppliers[2] },
    { name: 'Sea Urchin', category: 'food', unit: 'oz', supplier: suppliers[2] },
    { name: 'Uni (Sea Urchin)', category: 'food', unit: 'piece', supplier: suppliers[2] },
    { name: 'Beluga Caviar', category: 'food', unit: 'oz', supplier: suppliers[2] },
    { name: 'White Miso', category: 'food', unit: 'lb', supplier: suppliers[1] },
    { name: 'Dashi Stock', category: 'food', unit: 'liter', supplier: suppliers[1] },
    { name: 'Yuzu Juice', category: 'food', unit: 'bottle', supplier: suppliers[1] },
    { name: 'Balsamic Vinegar 25yr', category: 'food', unit: 'bottle', supplier: suppliers[1] },
    { name: 'Olive Oil Extra Virgin', category: 'food', unit: 'liter', supplier: suppliers[1] },
    { name: 'Butter (Cultured)', category: 'food', unit: 'lb', supplier: suppliers[1] },
    { name: 'Heavy Cream', category: 'food', unit: 'liter', supplier: suppliers[1] },
    { name: 'Creme Fraiche', category: 'food', unit: 'lb', supplier: suppliers[1] },
    { name: 'Foie Gras Terrine', category: 'food', unit: 'lb', supplier: suppliers[1] },
    { name: 'Pâté de Foie Gras', category: 'food', unit: 'oz', supplier: suppliers[1] },
    { name: 'Black Garlic', category: 'food', unit: 'lb', supplier: suppliers[1] },
    { name: 'Kombu Seaweed', category: 'food', unit: 'oz', supplier: suppliers[1] },
    { name: 'Nori Seaweed', category: 'food', unit: 'sheet', supplier: suppliers[1] },
    { name: 'Miso Paste Red', category: 'food', unit: 'lb', supplier: suppliers[1] },
  ];

  // Seafood (20 items)
  const seafood = [
    { name: 'Fresh Lobster', category: 'food', unit: 'lb', supplier: suppliers[2] },
    { name: 'Dungeness Crab', category: 'food', unit: 'lb', supplier: suppliers[2] },
    { name: 'Diver Scallops', category: 'food', unit: 'lb', supplier: suppliers[2] },
    { name: 'Sashimi Grade Tuna', category: 'food', unit: 'lb', supplier: suppliers[2] },
    { name: 'Salmon Fillets', category: 'food', unit: 'lb', supplier: suppliers[2] },
    { name: 'Dover Sole', category: 'food', unit: 'lb', supplier: suppliers[2] },
    { name: 'Halibut Fillets', category: 'food', unit: 'lb', supplier: suppliers[2] },
    { name: 'Sea Bass', category: 'food', unit: 'lb', supplier: suppliers[2] },
    { name: 'Hamachi (Yellowtail)', category: 'food', unit: 'lb', supplier: suppliers[2] },
    { name: 'Squid (Fresh)', category: 'food', unit: 'lb', supplier: suppliers[2] },
    { name: 'Octopus', category: 'food', unit: 'lb', supplier: suppliers[2] },
    { name: 'Fresh Oysters', category: 'food', unit: 'dozen', supplier: suppliers[2] },
    { name: 'Manila Clams', category: 'food', unit: 'lb', supplier: suppliers[2] },
    { name: 'Littleneck Clams', category: 'food', unit: 'dozen', supplier: suppliers[2] },
    { name: 'Mussels (Fresh)', category: 'food', unit: 'lb', supplier: suppliers[2] },
    { name: 'Spot Prawns', category: 'food', unit: 'lb', supplier: suppliers[2] },
    { name: 'Shrimp (Large)', category: 'food', unit: 'lb', supplier: suppliers[2] },
    { name: 'Fish Stock', category: 'food', unit: 'liter', supplier: suppliers[2] },
    { name: 'Lobster Stock', category: 'food', unit: 'liter', supplier: suppliers[2] },
    { name: 'Shellfish Bisque Base', category: 'food', unit: 'liter', supplier: suppliers[2] },
  ];

  // Meat (20 items)
  const meats = [
    { name: 'Wagyu Ribeye', category: 'food', unit: 'lb', supplier: suppliers[3] },
    { name: 'Prime Ribeye', category: 'food', unit: 'lb', supplier: suppliers[3] },
    { name: 'Filet Mignon', category: 'food', unit: 'lb', supplier: suppliers[3] },
    { name: 'NY Strip Steak', category: 'food', unit: 'lb', supplier: suppliers[3] },
    { name: 'Porterhouse Steak', category: 'food', unit: 'lb', supplier: suppliers[3] },
    { name: 'Lamb Chops', category: 'food', unit: 'lb', supplier: suppliers[3] },
    { name: 'Rack of Lamb', category: 'food', unit: 'lb', supplier: suppliers[3] },
    { name: 'Duck Breast', category: 'food', unit: 'lb', supplier: suppliers[3] },
    { name: 'Whole Duck', category: 'food', unit: 'piece', supplier: suppliers[3] },
    { name: 'Foie Gras Lobe', category: 'food', unit: 'lb', supplier: suppliers[3] },
    { name: 'Veal Loin', category: 'food', unit: 'lb', supplier: suppliers[3] },
    { name: 'Veal Sweetbreads', category: 'food', unit: 'lb', supplier: suppliers[3] },
    { name: 'Beef Tenderloin', category: 'food', unit: 'lb', supplier: suppliers[3] },
    { name: 'Beef Cheeks', category: 'food', unit: 'lb', supplier: suppliers[3] },
    { name: 'Beef Marrow Bones', category: 'food', unit: 'lb', supplier: suppliers[3] },
    { name: 'Short Ribs', category: 'food', unit: 'lb', supplier: suppliers[3] },
    { name: 'Chicken Breast (Organic)', category: 'food', unit: 'lb', supplier: suppliers[3] },
    { name: 'Whole Chicken', category: 'food', unit: 'piece', supplier: suppliers[3] },
    { name: 'Beef Stock', category: 'food', unit: 'liter', supplier: suppliers[3] },
    { name: 'Veal Stock', category: 'food', unit: 'liter', supplier: suppliers[3] },
  ];

  const allInventory = [...wines, ...produce, ...seafood, ...meats];

  for (let i = 0; i < allInventory.length; i++) {
    const item = allInventory[i];
    const inventoryItem = await prisma.inventoryItem.create({
      data: {
        tenantId: tenant.id,
        name: item.name,
        category: item.category,
        unit: item.unit,
        currentStock: new Decimal((10 + Math.random() * 100).toFixed(2)),
        minStock: new Decimal('5'),
        unitCost: new Decimal((5 + Math.random() * 500).toFixed(2)),
        supplierId: item.supplier.id,
      },
    });

    inventoryItems.push(inventoryItem);

    // Add wine details for wine items
    if (item.category === 'wine' && i < 15) {
      // First 15 are fine wines
      await prisma.wineDetail.create({
        data: {
          inventoryItemId: inventoryItem.id,
          vintage: `${2010 + Math.floor(Math.random() * 15)}`,
          region: 'Bordeaux, France',
          varietal: 'Cabernet Sauvignon',
          binLocation: `Bin-${1000 + i}`,
          tastingNotes: 'Complex, elegant finish',
          pairingNotes: 'Pairs well with lamb, beef, aged cheese',
        },
      });
    }
  }

  // Create stock movements for some items
  console.log('📦 Creating stock movements...');
  for (let i = 0; i < 30; i++) {
    await prisma.stockMovement.create({
      data: {
        tenantId: tenant.id,
        inventoryItemId: inventoryItems[Math.floor(Math.random() * inventoryItems.length)].id,
        type: ['in', 'out', 'adjustment'][Math.floor(Math.random() * 3)],
        quantity: new Decimal(Math.ceil(Math.random() * 50).toString()),
        reason: 'Delivery received',
        performedBy: users[0].id,
      },
    });
  }

  // Create shifts
  console.log('👔 Creating shifts...');
  for (let i = 0; i < 10; i++) {
    const dayOffset = Math.floor(i / 2);
    const shiftDate = new Date(now);
    shiftDate.setDate(shiftDate.getDate() - dayOffset);

    const randomServer = users.filter((u) => u.role === UserRole.SERVER)[
      Math.floor(Math.random() * 5)
    ];

    await prisma.shift.create({
      data: {
        tenantId: tenant.id,
        userId: randomServer.id,
        role: randomServer.role,
        startAt: new Date(shiftDate.setHours(11, 0, 0, 0)),
        endAt: new Date(shiftDate.setHours(23, 0, 0, 0)),
      },
    });
  }

  console.log('✅ Seeding completed successfully!');
  console.log('\n📊 Summary:');
  console.log(`  Tenant: ${tenant.name}`);
  console.log(`  Location: ${location.name}`);
  console.log(`  Users: ${users.length}`);
  console.log(`  Tables: ${tables.length}`);
  console.log(`  Menu Items: ${menuItems.length}`);
  console.log(`  Inventory Items: ${inventoryItems.length}`);
  console.log(`  Suppliers: ${suppliers.length}`);
  console.log(`  Business Days: ${businessDays.length}`);
  console.log(`  Reservations: 21 (3 per day × 7 days)`);
  console.log(`  Orders: 50 (sample over 30 days)`);
}

main()
  .catch((e) => {
    console.error('❌ Error during seeding:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

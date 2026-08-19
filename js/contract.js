(function () {
  "use strict";

  var STORAGE_KEY = "stl-dsa-draft-v1";
  var LOGO_SRC = "images/stlapps-logo.jpg";

  var root = document.querySelector("[data-contract-root]") || document;
  var chrome = document.querySelector("[data-contract-chrome]") || root;

  function conEl(name, fallbackId) {
    var found = root.querySelector('[data-el="' + name + '"]');
    if (found) return found;
    if (chrome && chrome !== root) {
      found = chrome.querySelector('[data-el="' + name + '"]');
      if (found) return found;
    }
    return document.getElementById(fallbackId || name);
  }

  var form = conEl("form", "contract-form");
  var itemsEl = conEl("items", "items");
  var totalsEl = conEl("totals", "totals");
  var previewEl = conEl("preview", "preview");
  var errorEl = conEl("error", "form-error");
  var addItemBtn = conEl("add-item", "add-item");
  var downloadBtn = conEl("download", "download-pdf");
  var resetBtn = conEl("reset", "reset-form");
  var depositAmountInput = form ? form.elements.depositAmount : null;
  var depositPercentInput = form ? form.elements.depositPercent : null;

  if (!form || !itemsEl || !previewEl) return;

  var depositManual = false;
  var logoDataUrl = null;

  function todayISO() {
    var d = new Date();
    var m = String(d.getMonth() + 1).padStart(2, "0");
    var day = String(d.getDate()).padStart(2, "0");
    return d.getFullYear() + "-" + m + "-" + day;
  }

  function money(n) {
    var x = Number(n);
    if (!Number.isFinite(x)) x = 0;
    return x.toLocaleString("en-US", { style: "currency", currency: "USD" });
  }

  function round2(n) {
    return Math.round((Number(n) || 0) * 100) / 100;
  }

  function text(v) {
    return String(v == null ? "" : v).trim();
  }

  function article(state) {
    return /^[aeiou]/i.test(text(state)) ? "an" : "a";
  }

  function formatDate(iso) {
    if (!iso) return "____________________";
    var d = new Date(iso + "T00:00:00");
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric"
    });
  }

  function slug(s) {
    return text(s)
      .replace(/[^a-z0-9]+/gi, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 40) || "client";
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function nl2br(s) {
    return escapeHtml(s).replace(/\n/g, "<br />");
  }

  function addItemRow(desc, price) {
    var row = document.createElement("div");
    row.className = "item-row";
    row.innerHTML =
      '<input class="item-desc" type="text" placeholder="e.g., Custom website homepage" />' +
      '<input class="item-price" type="number" min="0" step="0.01" placeholder="0.00" />' +
      '<button class="item-remove" type="button" aria-label="Remove line item">&times;</button>';
    if (desc) row.querySelector(".item-desc").value = desc;
    if (price != null && price !== "") row.querySelector(".item-price").value = price;
    row.querySelector(".item-remove").addEventListener("click", function () {
      if (itemsEl.querySelectorAll(".item-row").length <= 1) {
        row.querySelector(".item-desc").value = "";
        row.querySelector(".item-price").value = "";
      } else {
        row.remove();
      }
      refresh();
    });
    row.querySelector(".item-desc").addEventListener("input", refresh);
    row.querySelector(".item-price").addEventListener("input", refresh);
    itemsEl.appendChild(row);
  }

  function collectItems() {
    return Array.prototype.map.call(itemsEl.querySelectorAll(".item-row"), function (row, i) {
      return {
        n: i + 1,
        desc: text(row.querySelector(".item-desc").value),
        price: round2(row.querySelector(".item-price").value)
      };
    }).filter(function (item) {
      return item.desc || item.price;
    });
  }

  function collect() {
    var items = collectItems();
    var total = round2(items.reduce(function (sum, item) { return sum + (item.price || 0); }, 0));
    var pct = Number(depositPercentInput.value);
    if (!Number.isFinite(pct) || pct < 0) pct = 0;
    if (pct > 100) pct = 100;

    var deposit;
    if (depositManual && text(depositAmountInput.value) !== "") {
      deposit = round2(depositAmountInput.value);
    } else {
      deposit = round2(total * (pct / 100));
    }
    if (deposit > total) deposit = total;
    if (deposit < 0) deposit = 0;
    var remaining = round2(Math.max(0, total - deposit));

    return {
      effectiveDate: form.effectiveDate.value,
      estimatedCompletion: form.estimatedCompletion.value,
      projectName: text(form.projectName.value),
      clientName: text(form.clientName.value),
      clientSigner: text(form.clientSigner.value),
      clientTitle: text(form.clientTitle.value),
      clientEmail: text(form.clientEmail.value),
      clientPhone: text(form.clientPhone.value),
      clientAddress: text(form.clientAddress.value),
      developerEntity: text(form.developerEntity.value) || "STL Apps LLC",
      developerState: text(form.developerState.value) || "Oklahoma",
      developerSigner: text(form.developerSigner.value) || "Sean Tyler Lee",
      developerTitle: text(form.developerTitle.value) || "Member",
      developerEmail: text(form.developerEmail.value) || "seantylerlee@icloud.com",
      developerPhone: text(form.developerPhone.value),
      developerAddress: text(form.developerAddress.value),
      hourlyRate: round2(form.hourlyRate.value || 150),
      depositPercent: pct,
      depositAmount: deposit,
      remaining: remaining,
      total: total,
      paymentNotes: text(form.paymentNotes.value),
      revisionRounds: Math.max(0, parseInt(form.revisionRounds.value, 10) || 0),
      reviewDays: Math.max(1, parseInt(form.reviewDays.value, 10) || 7),
      warrantyDays: Math.max(0, parseInt(form.warrantyDays.value, 10) || 0),
      lateFee: Number(form.lateFee.value) || 1.5,
      governingState: text(form.governingState.value) || "Oklahoma",
      venue: text(form.venue.value),
      extraTerms: text(form.extraTerms.value),
      items: items,
      depositManual: depositManual
    };
  }

  function validate(d) {
    if (!d.effectiveDate) return "Set an effective date.";
    if (!d.clientName) return "Enter the client legal name.";
    if (!d.items.length) return "Add at least one line item.";
    var missingDesc = d.items.some(function (item) { return !item.desc; });
    if (missingDesc) return "Every line item needs a description.";
    if (d.total <= 0) return "Add a price to at least one line item.";
    if (!d.governingState) return "Enter the governing state.";
    if (!d.venue) return "Enter the venue (county or city) so a court knows where disputes go.";
    return "";
  }

  function partyLines(d, who) {
    if (who === "developer") {
      var lines = [
        d.developerEntity,
        article(d.developerState) + " " + d.developerState + " limited liability company"
      ];
      if (d.developerSigner) {
        lines.push(d.developerSigner + (d.developerTitle ? ", " + d.developerTitle : ""));
      }
      if (d.developerEmail) lines.push(d.developerEmail);
      if (d.developerPhone) lines.push(d.developerPhone);
      if (d.developerAddress) {
        d.developerAddress.split(/\n+/).forEach(function (line) {
          if (text(line)) lines.push(text(line));
        });
      }
      return lines;
    }
    var c = [
      d.clientName || "[Client legal name]"
    ];
    if (d.clientSigner) {
      c.push(d.clientSigner + (d.clientTitle ? ", " + d.clientTitle : ""));
    }
    if (d.clientEmail) c.push(d.clientEmail);
    if (d.clientPhone) c.push(d.clientPhone);
    if (d.clientAddress) {
      d.clientAddress.split(/\n+/).forEach(function (line) {
        if (text(line)) c.push(text(line));
      });
    }
    return c;
  }

  function buildModel(d) {
    var client = d.clientName || "[Client Name / Company Name]";
    var dev = d.developerEntity;
    var hourly = money(d.hourlyRate);
    var payHow = d.paymentNotes
      ? d.paymentNotes
      : "as directed by Developer in writing (ACH, wire, check, Zelle, or another method Developer specifies)";
    var venue = d.venue || "[County / City]";
    var projectBit = d.projectName ? ' for the project known as "' + d.projectName + '"' : "";
    var estimateBit = d.estimatedCompletion
      ? " The parties' target completion date is " + formatDate(d.estimatedCompletion) + ". That date is an estimate only, not a guaranteed delivery date, and may move if Client delays, change orders, or third-party platforms require extra work."
      : " Any dates discussed are estimates only and are not guaranteed delivery dates.";
    var warrantyBit = d.warrantyDays > 0
      ? "For " + d.warrantyDays + " days after acceptance, Developer will use reasonable efforts to fix defects that cause in-scope Work to materially fail to function as described in the line items."
      : "Developer has no post-acceptance bug-fix obligation unless a line item says otherwise.";

    var sections = [
      {
        num: "1",
        title: "SCOPE OF WORK AND LINE ITEMS",
        blocks: [
          {
            type: "p",
            text:
              "Developer agrees to perform development services and deliver the items listed in the table below (the \"Work\")" +
              projectBit +
              ". The table is the complete statement of in-scope Work. Features, pages, platforms, roles, integrations, animations, content, copywriting, photography, data migration, training, analytics, SEO campaigns, ongoing hosting, and anything else not expressly listed are out of scope and require a separate written change order or additional hourly fees."
          },
          { type: "items" },
          {
            type: "lead",
            lead: "Change orders.",
            text:
              "Developer is not obligated to perform out-of-scope work. If Client requests additions or material changes, Developer may decline them or quote a written change order with price and timeline. No change order is binding until both parties accept it in writing (email is sufficient). Additional work not covered by a fixed change order may be billed at " +
              hourly +
              " per hour, invoiced as the work proceeds, and is due before that extra work is delivered or launched."
          }
        ]
      },
      {
        num: "2",
        title: "CLIENT RESPONSIBILITIES AND DELAYS",
        blocks: [
          {
            type: "p",
            text:
              "Client shall promptly provide all content, credentials, feedback, decisions, approvals, and access reasonably required, including Apple Developer, Google Play, domain, hosting, and payment-processor accounts unless a line item says Developer will supply them. Client shall designate one decision-maker. Developer may rely on that person's instructions."
          },
          {
            type: "lead",
            lead: "Client delays.",
            text:
              "If Client is late with materials, access, or approvals, all dates automatically extend by the length of the delay plus a reasonable restart period. Delay by Client is not a breach by Developer and does not entitle Client to a refund, discount, or free extra work." +
              estimateBit
          },
          {
            type: "lead",
            lead: "Client materials.",
            text:
              "Client represents that content, marks, data, and materials it provides do not infringe third-party rights and that Client has authority to have the Work built. Client is responsible for backing up its own data."
          }
        ]
      },
      {
        num: "3",
        title: "COMPENSATION AND PAYMENT TERMS",
        blocks: [
          {
            type: "lead",
            lead: "Initial downpayment.",
            text:
              "Client shall pay a non-refundable deposit of " +
              money(d.depositAmount) +
              " (" +
              d.depositPercent +
              "% of the Total Price, unless a different dollar amount is stated here) upon signing this Agreement. Work will not commence until this downpayment has cleared. The deposit is earned on signing. It is not a penalty. It compensates Developer for booking time, discovery, setup, and turning down other work."
          },
          {
            type: "lead",
            lead: "Final payment.",
            text:
              "The remaining balance of " +
              money(d.remaining) +
              " is due immediately upon Developer's Completion Notice under Section 6 and, in any event, before launch, deployment, transfer of accounts, transfer of source code, or any license or assignment of intellectual property. Developer has no duty to deliver, launch, or transfer anything while any amount is unpaid."
          },
          {
            type: "lead",
            lead: "Method and taxes.",
            text:
              "All amounts are payable to " +
              dev +
              ", " +
              payHow +
              ". Fees are exclusive of taxes. Client is responsible for any sales, use, or similar taxes other than taxes on Developer's net income."
          },
          {
            type: "lead",
            lead: "Late payment; suspension.",
            text:
              "Amounts more than seven (7) days past due accrue interest at " +
              d.lateFee +
              "% per month or the maximum allowed by law, whichever is less. Developer may immediately suspend work, withhold delivery, disable staging or launch access, and retain all Work Product if any amount is unpaid. If a past-due amount is not cured within ten (10) days after written notice, Developer may terminate for Client's breach."
          }
        ]
      },
      {
        num: "4",
        title: "THIRD-PARTY COSTS, ACCOUNTS, AND PLATFORMS",
        blocks: [
          {
            type: "p",
            text:
              "Unless a line item expressly says Developer will pay a specific third-party fee, Client is solely responsible for all third-party costs, including Apple Developer Program fees, Google Play fees, domains, hosting, databases, email, SMS, maps, AI or API usage, payment processing, SSL, software licenses, stock assets, and app-store commissions."
          },
          {
            type: "lead",
            lead: "Accounts stay with Developer until paid.",
            text:
              "Developer may use Developer-owned accounts, keys, repositories, or infrastructure during development. Those remain Developer's property. Access, transfer, or assignment of accounts, repositories, databases, or credentials occurs only after the Total Price is paid in full."
          },
          {
            type: "lead",
            lead: "No store or platform guarantee.",
            text:
              "Developer does not guarantee approval by Apple, Google, payment processors, app stores, hosting providers, or any other third-party platform. Rejection, delay, policy changes, or extra requirements by a third party are not a Developer breach and may require a change order."
          }
        ]
      },
      {
        num: "5",
        title: "INTELLECTUAL PROPERTY AND SAFEGUARD AGAINST NON-PAYMENT",
        blocks: [
          {
            type: "lead",
            lead: "Retention of rights.",
            text:
              "All Work Product -- including code, designs, graphics, architecture, databases, documentation, repositories, and staging environments created under this Agreement -- is and remains the sole and exclusive property of " +
              dev +
              " until Client has paid the Total Price in full and this Agreement has not been terminated for Client's breach."
          },
          {
            type: "lead",
            lead: "Developer Tools.",
            text:
              "Developer retains all rights in pre-existing tools, libraries, snippets, frameworks, templates, know-how, and generic components (\"Developer Tools\"), and in Developer's name, marks, and other products (including Permit Path, HaulPath, Pilot Car 4 Hire, FleetDispatch, and STL Apps). Developer Tools are licensed, not sold. After full payment, Client receives only a non-exclusive license to use Developer Tools as embodied in the delivered Work, not to extract them as a standalone product or competing kit."
          },
          {
            type: "lead",
            lead: "Assignment after payment only.",
            text:
              "Only after cleared receipt of the Total Price in full, Developer assigns to Client the custom Work Product created specifically for Client under this Agreement, excluding Developer Tools and third-party materials. Third-party software remains subject to its own licenses. No implied license exists before that payment clears."
          },
          {
            type: "lead",
            lead: "Prohibition of use if unpaid.",
            text:
              "Client is strictly prohibited from launching, deploying, hosting, copying, forking, screenshot-rebuilding, or using any portion of the website, application, or source code if any balance remains unpaid or if this Agreement ends before full payment. Any such use is a material breach and willful copyright infringement."
          },
          {
            type: "lead",
            lead: "Legal protections.",
            text:
              "If Client uses, deploys, or profits from the product without making full and final payment, Developer may seek immediate injunctive relief in court to take the product down (without the need to post a bond to the extent a court allows), plus damages, disgorgement of profits, and recovery of attorney's fees and costs. These remedies are in addition to all other rights at law or in equity."
          },
          {
            type: "lead",
            lead: "Incomplete work.",
            text:
              "Client has no right to use, receive, or demand delivery of incomplete or unfinished Work Product except as Developer agrees in a signed writing after payment of all amounts then due."
          }
        ]
      },
      {
        num: "6",
        title: "DELIVERY, ACCEPTANCE, AND REVISIONS",
        blocks: [
          {
            type: "p",
            text:
              "Developer will notify Client when the in-scope Work is complete (the \"Completion Notice\"), typically by delivering a review or staging link or a build. Client then has " +
              d.reviewDays +
              " days to send one written list of material defects where the Work does not conform to the line items -- not new feature requests. If Client does not send that list within the review period, the Work is deemed accepted."
          },
          {
            type: "p",
            text:
              "Developer will correct confirmed material defects in the listed line items at no extra charge. New features, design restyles, additional pages, extra platforms, and changes of mind are change orders. The Work includes " +
              d.revisionRounds +
              " round(s) of reasonable revisions to in-scope items. Further revisions are out of scope."
          },
          {
            type: "p",
            text:
              "Final files, source code, admin access, and launch assistance are delivered only after the remaining balance has cleared."
          }
        ]
      },
      {
        num: "7",
        title: "MAINTENANCE AND SUPPORT",
        blocks: [
          {
            type: "p",
            text:
              "Unless a line item expressly includes ongoing maintenance, hosting, monitoring, updates, content changes, or support, none is included. After the limited warranty in Section 11, additional work is a new engagement at Developer's then-current rates."
          }
        ]
      },
      {
        num: "8",
        title: "DEVELOPER RIGHT OF TERMINATION (SCOPE AND FEASIBILITY)",
        blocks: [
          {
            type: "p",
            text:
              "Developer is committed to high-quality engineering. Developer may terminate this Agreement immediately by written notice if Developer determines, in its sole professional discretion, that: (a) requirements have grown beyond the line items or Developer's operational capacity; (b) unforeseen technical, legal, or third-party issues make completion not reasonably feasible on the agreed terms; (c) Client is abusive, unresponsive for fourteen (14) or more days, or asks Developer to do something unlawful or that would infringe third-party rights; or (d) Client is in material breach."
          },
          {
            type: "lead",
            lead: "Retention of downpayment.",
            text:
              "If Developer terminates under this Section, Developer is not required to refund the initial downpayment or any other amounts paid to date. Those funds are retained by Developer as compensation for administrative, discovery, consultation, calendar reservation, and resource costs expended -- not as a penalty -- and all further development obligations cease. Unpaid invoices for work already performed remain due. Client shall have no license or ownership in any Work Product unless and until all amounts due are paid and Developer agrees in writing to a limited release of specific files."
          }
        ]
      },
      {
        num: "9",
        title: "CLIENT CANCELLATION",
        blocks: [
          {
            type: "p",
            text:
              "Client may cancel by written notice. The deposit remains non-refundable. If the value of work performed (completed line items, or, for partial items, time at " +
              hourly +
              " per hour) exceeds amounts already paid, Client shall pay the difference within seven (7) days. No Work Product, source, or accounts will be released unless the Total Price -- or, if Developer agrees in writing to a partial release, all amounts then due -- has been paid."
          }
        ]
      },
      {
        num: "10",
        title: "CONFIDENTIALITY AND PORTFOLIO",
        blocks: [
          {
            type: "p",
            text:
              "Each party shall keep the other's non-public business, technical, and customer information confidential and use it only to perform this Agreement, except for information that is public, independently developed, or required to be disclosed by law. Developer will not publish Client passwords or unpublished trade secrets."
          },
          {
            type: "lead",
            lead: "Portfolio.",
            text:
              "Unless Client objects in writing before launch, Developer may name Client and show non-confidential screenshots or descriptions of the Work in portfolios, proposals, and marketing. This does not transfer any Client trademark to Developer."
          }
        ]
      },
      {
        num: "11",
        title: "LIMITED WARRANTY AND DISCLAIMER",
        blocks: [
          {
            type: "p",
            text:
              warrantyBit +
              " This warranty does not cover third-party outages, Client changes, new requests, content errors, hosting the Client controls, or misuse. Developer does not warrant that the Work is immune from all security issues."
          },
          {
            type: "p",
            text:
              "EXCEPT FOR THAT LIMITED WARRANTY, THE WORK IS PROVIDED \"AS IS.\" DEVELOPER DISCLAIMS ALL OTHER WARRANTIES, EXPRESS OR IMPLIED, INCLUDING MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, TITLE, AND NON-INFRINGEMENT. DEVELOPER DOES NOT WARRANT UNINTERRUPTED OR ERROR-FREE OPERATION, APP-STORE APPROVAL, UPTIME, OR SPECIFIC BUSINESS RESULTS."
          }
        ]
      },
      {
        num: "12",
        title: "LIMITATION OF LIABILITY",
        blocks: [
          {
            type: "p",
            text:
              "TO THE MAXIMUM EXTENT PERMITTED BY LAW, " +
              dev.toUpperCase() +
              " AND ITS MEMBERS, OFFICERS, AND CONTRACTORS SHALL NOT BE LIABLE TO CLIENT OR ANY THIRD PARTY FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, EXEMPLARY, OR PUNITIVE DAMAGES, OR FOR LOST PROFITS, LOST REVENUE, LOST DATA, SERVER DOWNTIME, BUSINESS INTERRUPTION, OR COST OF SUBSTITUTE SERVICES, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGES."
          },
          {
            type: "p",
            text:
              "IN NO EVENT SHALL DEVELOPER'S TOTAL LIABILITY FOR ALL CLAIMS ARISING OUT OF THIS AGREEMENT OR THE WORK EXCEED THE TOTAL AMOUNT OF FEES ACTUALLY PAID BY CLIENT TO DEVELOPER UNDER THIS AGREEMENT. These limits apply to the fullest extent the law allows and survive termination. Some jurisdictions do not allow certain limitations; in that case they apply to the maximum extent permitted."
          }
        ]
      },
      {
        num: "13",
        title: "INDEMNITY",
        blocks: [
          {
            type: "p",
            text:
              "Client shall defend, indemnify, and hold harmless " +
              dev +
              " and its members and contractors from claims, damages, and reasonable attorney's fees arising out of: (a) Client's materials, content, trademarks, or data; (b) Client's use, launch, or marketing of the Work; (c) Client's breach of this Agreement; or (d) Client's use of the Work while any amount is unpaid."
          }
        ]
      },
      {
        num: "14",
        title: "INDEPENDENT CONTRACTOR",
        blocks: [
          {
            type: "p",
            text:
              "Developer is an independent contractor, not an employee, partner, or joint venturer of Client. Developer controls the means and methods of the Work, may use subcontractors, and may work for other clients, including in the same industry. Client is not responsible for Developer's taxes, unemployment, or benefits and shall not treat Developer as an employee."
          }
        ]
      },
      {
        num: "15",
        title: "FORCE MAJEURE",
        blocks: [
          {
            type: "p",
            text:
              "Developer is not liable for delay or failure caused by events beyond its reasonable control, including illness, outages, platform changes, labor issues, and natural events. Dates extend for the duration of the event."
          }
        ]
      },
      {
        num: "16",
        title: "NOTICES",
        blocks: [
          {
            type: "p",
            text:
              "Notices under this Agreement are effective when sent by email to the addresses listed above, or to a replacement address a party designates in writing. Client is responsible for keeping its email current."
          }
        ]
      },
      {
        num: "17",
        title: "GENERAL",
        blocks: [
          {
            type: "p",
            text:
              "This Agreement is the entire agreement on this subject and supersedes prior proposals, conversations, and emails. Changes must be in writing and accepted by both parties (email is sufficient). If a provision is unenforceable, the rest remains in effect. A failure to enforce a provision is not a waiver. Client may not assign this Agreement without Developer's written consent. Developer may assign it to a successor of its business and may use subcontractors. Headings are for convenience only. This Agreement may be signed in counterparts, including electronic signature or a typed name with intent to sign, each of which is deemed an original. The prevailing party in a dispute to enforce this Agreement is entitled to reasonable attorney's fees and costs. Provisions that by their nature should survive -- including intellectual property, payment, limitation of liability, indemnity, and confidentiality -- survive termination."
          }
        ]
      },
      {
        num: "18",
        title: "GOVERNING LAW AND JURISDICTION",
        blocks: [
          {
            type: "p",
            text:
              "This Agreement shall be governed, construed, and enforced in accordance with the laws of the State of " +
              d.governingState +
              ", without regard to its conflict-of-law principles. Any legal action or court proceeding arising out of this contract shall be brought exclusively in the state or federal courts located in " +
              venue +
              ", and each party consents to personal jurisdiction and venue there."
          }
        ]
      }
    ];

    if (d.extraTerms) {
      sections.push({
        num: String(sections.length + 1),
        title: "ADDITIONAL TERMS",
        blocks: [{ type: "p", text: d.extraTerms }]
      });
    }

    sections.push({
      num: String(sections.length + 1),
      title: "SIGNATURES",
      blocks: [
        {
          type: "p",
          text:
            "By signing below, each party acknowledges that it has read, understood, and agreed to all terms, safeguards, and payment rules in this Agreement, and that the signer is authorized to bind that party."
        },
        { type: "sigs" }
      ]
    });

    return {
      title: "DEVELOPMENT SERVICES AGREEMENT",
      intro:
        "This Development Services Agreement (\"Agreement\") is entered into as of " +
        formatDate(d.effectiveDate) +
        " (the \"Effective Date\") by and between the Developer and the Client named below. In this Agreement, \"Developer\" means " +
        dev +
        " and \"Client\" means " +
        client +
        ".",
      sections: sections
    };
  }

  function renderTotals(d) {
    totalsEl.innerHTML =
      "<div><span>Project total</span><strong>" + money(d.total) + "</strong></div>" +
      "<div><span>Deposit due on signing</span><span>" + money(d.depositAmount) + "</span></div>" +
      "<div><span>Balance before delivery</span><span>" + money(d.remaining) + "</span></div>" +
      "<div class=\"grand\"><span>Amount Client must pay to own the work</span><span>" + money(d.total) + "</span></div>";
  }

  function renderPreview(d) {
    var model = buildModel(d);
    var items = d.items.length ? d.items : [{ n: 1, desc: "[Add a deliverable]", price: 0 }];
    var rows = items.map(function (item) {
      return (
        "<tr><td class=\"num\">" + item.n + "</td><td>" +
        escapeHtml(item.desc || "") +
        "</td><td class=\"price\">" + money(item.price) + "</td></tr>"
      );
    }).join("");

    var table =
      "<table class=\"scope-table\"><thead><tr>" +
      "<th class=\"num\">Item</th><th>Description of Deliverable / Feature</th><th class=\"price\">Price</th>" +
      "</tr></thead><tbody>" + rows + "</tbody><tfoot><tr>" +
      "<td></td><td>Project Total Estimated Cost</td><td class=\"price\">" + money(d.total) + "</td>" +
      "</tr></tfoot></table>";

    var html = "";
    html += '<div class="paper-letterhead">';
    html += '<img src="' + LOGO_SRC + '" alt="STL Apps LLC" width="200" height="46" />';
    html += '<div class="paper-meta"><strong>Confidential</strong><span>Effective ' + escapeHtml(formatDate(d.effectiveDate)) + "</span></div>";
    html += "</div>";
    html += "<h1>" + escapeHtml(model.title) + "</h1>";
    if (d.projectName) {
      html += '<p class="project-line">Project: ' + escapeHtml(d.projectName) + "</p>";
    }
    html += '<div class="parties">';
    html += '<div class="party"><h3>Developer</h3>' + partyLines(d, "developer").map(function (line) {
      return "<p>" + nl2br(line) + "</p>";
    }).join("") + "</div>";
    html += '<div class="party"><h3>Client</h3>' + partyLines(d, "client").map(function (line) {
      return "<p>" + nl2br(line) + "</p>";
    }).join("") + "</div>";
    html += "</div>";
    html += "<p>" + escapeHtml(model.intro) + "</p>";

    model.sections.forEach(function (section) {
      html += "<h2>" + escapeHtml(section.num + ". " + section.title) + "</h2>";
      section.blocks.forEach(function (block) {
        if (block.type === "items") {
          html += table;
        } else if (block.type === "sigs") {
          html += '<div class="sigs">';
          html += '<div class="sig"><h3>Developer: ' + escapeHtml(d.developerEntity) + "</h3>";
          html += "<p>" + escapeHtml(d.developerSigner) + (d.developerTitle ? ", " + escapeHtml(d.developerTitle) : "") + "</p>";
          html += '<div class="sig-line">Authorized Signature</div><div class="sig-date">Date</div></div>';
          html += '<div class="sig"><h3>Client: ' + escapeHtml(d.clientName || "[Client Name]") + "</h3>";
          html += "<p>" + escapeHtml(d.clientSigner || "Authorized signer") + (d.clientTitle ? ", " + escapeHtml(d.clientTitle) : "") + "</p>";
          html += '<div class="sig-line">Authorized Signature</div><div class="sig-date">Date</div></div>';
          html += "</div>";
        } else if (block.type === "lead") {
          html += "<p><span class=\"lead\">" + escapeHtml(block.lead) + "</span> " + escapeHtml(block.text) + "</p>";
        } else {
          html += "<p>" + escapeHtml(block.text).replace(/\n/g, "<br />") + "</p>";
        }
      });
    });

    previewEl.innerHTML = html;
  }

  function persist(d) {
    var raw = {
      depositManual: depositManual,
      values: {},
      items: collectItems()
    };
    Array.prototype.forEach.call(form.elements, function (el) {
      if (!el.name) return;
      raw.values[el.name] = el.value;
    });
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(raw));
    } catch (e) {}
  }

  function restore() {
    var raw;
    try {
      raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    } catch (e) {
      raw = null;
    }
    if (!raw || !raw.values) {
      addItemRow();
      addItemRow();
      addItemRow();
      form.effectiveDate.value = todayISO();
      return;
    }
    Object.keys(raw.values).forEach(function (name) {
      if (form.elements[name] && name !== "depositAmount") {
        form.elements[name].value = raw.values[name];
      }
    });
    depositManual = !!raw.depositManual;
    if (raw.items && raw.items.length) {
      raw.items.forEach(function (item) {
        addItemRow(item.desc, item.price || "");
      });
    } else {
      addItemRow();
    }
    if (!form.effectiveDate.value) form.effectiveDate.value = todayISO();
    if (depositManual && raw.values.depositAmount != null) {
      depositAmountInput.value = raw.values.depositAmount;
    }
  }

  function refresh() {
    var d = collect();
    if (!depositManual) {
      depositAmountInput.value = d.total ? String(d.depositAmount) : "";
    }
    renderTotals(d);
    renderPreview(d);
    persist(d);
    errorEl.classList.remove("is-on");
    errorEl.textContent = "";
  }

  function loadLogo() {
    return new Promise(function (resolve) {
      if (logoDataUrl) {
        resolve(logoDataUrl);
        return;
      }
      var img = new Image();
      img.onload = function () {
        var canvas = document.createElement("canvas");
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        canvas.getContext("2d").drawImage(img, 0, 0);
        logoDataUrl = canvas.toDataURL("image/jpeg", 0.92);
        resolve(logoDataUrl);
      };
      img.onerror = function () {
        resolve(null);
      };
      img.src = LOGO_SRC;
    });
  }

  function PdfWriter(doc, logo) {
    this.doc = doc;
    this.logo = logo;
    this.pageW = 612;
    this.pageH = 792;
    this.mL = 54;
    this.mR = 54;
    this.mB = 50;
    this.top = 88;
    this.y = this.top;
    this.maxW = this.pageW - this.mL - this.mR;
    this.navy = [0, 24, 72];
    this.blue = [0, 112, 248];
    this.ink = [26, 35, 54];
    this.muted = [80, 92, 118];
    this.line = [213, 227, 251];
    this.ice = [244, 248, 255];
  }

  PdfWriter.prototype.ensure = function (h) {
    if (this.y + h > this.pageH - this.mB) {
      this.doc.addPage();
      this.y = this.top;
    }
  };

  PdfWriter.prototype.drawHeaderFooter = function () {
    var doc = this.doc;
    var pages = doc.getNumberOfPages();
    var i;
    for (i = 1; i <= pages; i += 1) {
      doc.setPage(i);
      doc.setFillColor(this.navy[0], this.navy[1], this.navy[2]);
      doc.rect(0, 0, this.pageW, 10, "F");
      if (this.logo) {
        doc.addImage(this.logo, "JPEG", this.mL, 18, 118, 27);
      } else {
        doc.setFont("helvetica", "bold");
        doc.setFontSize(12);
        doc.setTextColor(this.navy[0], this.navy[1], this.navy[2]);
        doc.text("STL Apps LLC", this.mL, 36);
      }
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.setTextColor(this.blue[0], this.blue[1], this.blue[2]);
      doc.text("CONFIDENTIAL", this.pageW - this.mR, 28, { align: "right" });
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(this.muted[0], this.muted[1], this.muted[2]);
      doc.text("Development Services Agreement", this.pageW - this.mR, 40, { align: "right" });
      doc.setDrawColor(this.navy[0], this.navy[1], this.navy[2]);
      doc.setLineWidth(1.15);
      doc.line(this.mL, 54, this.pageW - this.mR, 54);

      doc.setDrawColor(this.navy[0], this.navy[1], this.navy[2]);
      doc.setLineWidth(0.6);
      doc.line(this.mL, this.pageH - 36, this.pageW - this.mR, this.pageH - 36);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(this.muted[0], this.muted[1], this.muted[2]);
      doc.text("STL Apps LLC  ·  seantylerlee.com  ·  All rights reserved", this.mL, this.pageH - 22);
      doc.text("Page " + i + " of " + pages, this.pageW - this.mR, this.pageH - 22, { align: "right" });
    }
  };

  PdfWriter.prototype.p = function (str, opts) {
    opts = opts || {};
    var size = opts.size || 9.4;
    var lh = opts.lh || 12.6;
    var after = opts.after == null ? 7 : opts.after;
    var bold = !!opts.bold;
    this.doc.setFont("helvetica", bold ? "bold" : "normal");
    this.doc.setFontSize(size);
    this.doc.setTextColor(this.ink[0], this.ink[1], this.ink[2]);
    var lines = this.doc.splitTextToSize(str, this.maxW);
    var i;
    for (i = 0; i < lines.length; i += 1) {
      this.ensure(lh);
      this.doc.text(lines[i], this.mL, this.y);
      this.y += lh;
    }
    this.y += after;
  };

  PdfWriter.prototype.lead = function (lead, body) {
    var size = 9.4;
    var lh = 12.6;
    var leadText = /[.]$/.test(lead) ? lead + " " : lead + " ";
    this.doc.setFontSize(size);
    this.doc.setFont("helvetica", "bold");
    var leadW = this.doc.getTextWidth(leadText);
    this.doc.setFont("helvetica", "normal");
    this.doc.setTextColor(this.ink[0], this.ink[1], this.ink[2]);

    if (leadW > this.maxW * 0.62) {
      this.ensure(lh * 2);
      this.doc.setFont("helvetica", "bold");
      this.doc.text(lead, this.mL, this.y);
      this.y += lh;
      this.p(body, { after: 7 });
      return;
    }

    var words = body.split(/\s+/);
    var first = "";
    var used = 0;
    var i;
    var trial;
    for (i = 0; i < words.length; i += 1) {
      trial = first ? first + " " + words[i] : words[i];
      if (this.doc.getTextWidth(trial) <= this.maxW - leadW) {
        first = trial;
        used = i + 1;
      } else {
        break;
      }
    }
    this.ensure(lh);
    this.doc.setFont("helvetica", "bold");
    this.doc.setTextColor(this.navy[0], this.navy[1], this.navy[2]);
    this.doc.text(leadText, this.mL, this.y);
    this.doc.setFont("helvetica", "normal");
    this.doc.setTextColor(this.ink[0], this.ink[1], this.ink[2]);
    if (first) this.doc.text(first, this.mL + leadW, this.y);
    this.y += lh;
    var leftover = words.slice(used).join(" ");
    if (leftover) {
      var lines = this.doc.splitTextToSize(leftover, this.maxW);
      for (i = 0; i < lines.length; i += 1) {
        this.ensure(lh);
        this.doc.text(lines[i], this.mL, this.y);
        this.y += lh;
      }
    }
    this.y += 7;
  };

  PdfWriter.prototype.h2 = function (num, title) {
    this.ensure(28);
    this.y += 4;
    this.doc.setFillColor(this.ice[0], this.ice[1], this.ice[2]);
    this.doc.rect(this.mL, this.y - 11, this.maxW, 16, "F");
    this.doc.setFillColor(this.blue[0], this.blue[1], this.blue[2]);
    this.doc.rect(this.mL, this.y - 11, 3, 16, "F");
    this.doc.setFont("helvetica", "bold");
    this.doc.setFontSize(9.6);
    this.doc.setTextColor(this.navy[0], this.navy[1], this.navy[2]);
    this.doc.text(num + ".  " + title, this.mL + 10, this.y);
    this.y += 16;
  };

  PdfWriter.prototype.parties = function (d) {
    var colW = (this.maxW - 12) / 2;
    var left = partyLines(d, "developer");
    var right = partyLines(d, "client");
    var rows = Math.max(left.length, right.length);
    var boxH = 18 + rows * 11 + 14;
    this.ensure(boxH + 8);

    function box(doc, x, y, w, h, label, lines, navy, blue, ink) {
      doc.setFillColor(244, 248, 255);
      doc.setDrawColor(213, 227, 251);
      doc.setLineWidth(0.6);
      doc.roundedRect(x, y, w, h, 3, 3, "FD");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7.4);
      doc.setTextColor(blue[0], blue[1], blue[2]);
      doc.text(label, x + 8, y + 13);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8.4);
      doc.setTextColor(ink[0], ink[1], ink[2]);
      var i;
      var yy = y + 26;
      for (i = 0; i < lines.length; i += 1) {
        var wrapped = doc.splitTextToSize(lines[i], w - 16);
        doc.text(wrapped, x + 8, yy);
        yy += wrapped.length * 11;
      }
    }

    var leftH = 18 + left.reduce(function (h, line) {
      return h + Math.max(1, this.doc.splitTextToSize(line, colW - 16).length) * 11;
    }.bind(this), 0) + 16;
    var rightH = 18 + right.reduce(function (h, line) {
      return h + Math.max(1, this.doc.splitTextToSize(line, colW - 16).length) * 11;
    }.bind(this), 0) + 16;
    boxH = Math.max(leftH, rightH, 70);

    box(this.doc, this.mL, this.y, colW, boxH, "DEVELOPER", left, this.navy, this.blue, this.ink);
    box(this.doc, this.mL + colW + 12, this.y, colW, boxH, "CLIENT", right, this.navy, this.blue, this.ink);
    this.y += boxH + 14;
  };

  PdfWriter.prototype.items = function (d) {
    var body = (d.items.length ? d.items : [{ n: 1, desc: "[Add a deliverable]", price: 0 }]).map(function (item) {
      return [String(item.n), item.desc || "", money(item.price)];
    });
    this.ensure(80);
    this.doc.autoTable({
      startY: this.y,
      head: [["Item", "Description of Deliverable / Feature", "Price"]],
      body: body,
      foot: [["", "PROJECT TOTAL ESTIMATED COST", money(d.total)]],
      showHead: "everyPage",
      showFoot: "lastPage",
      theme: "grid",
      tableWidth: this.maxW,
      margin: { left: this.mL, right: this.mR, top: this.top, bottom: this.mB },
      styles: {
        font: "helvetica",
        fontSize: 8.6,
        cellPadding: 5,
        lineColor: [207, 220, 240],
        lineWidth: 0.4,
        textColor: [26, 35, 54],
        valign: "middle"
      },
      headStyles: {
        fillColor: this.navy,
        textColor: 255,
        fontStyle: "bold",
        fontSize: 8.2,
        cellPadding: 6
      },
      footStyles: {
        fillColor: this.ice,
        textColor: this.navy,
        fontStyle: "bold",
        fontSize: 8.6
      },
      columnStyles: {
        0: { cellWidth: 36, halign: "center" },
        1: { cellWidth: "auto" },
        2: { cellWidth: 88, halign: "right" }
      },
      didParseCell: function (data) {
        if (data.section === "foot" && data.column.index === 2) {
          data.cell.styles.halign = "right";
        }
      }
    });
    this.y = this.doc.lastAutoTable.finalY + 12;
  };

  PdfWriter.prototype.sigs = function (d) {
    this.ensure(150);
    var colW = (this.maxW - 24) / 2;
    var leftX = this.mL;
    var rightX = this.mL + colW + 24;
    var y0 = this.y + 6;

    var draw = function (x, title, name) {
      this.doc.setFont("helvetica", "bold");
      this.doc.setFontSize(9.2);
      this.doc.setTextColor(this.navy[0], this.navy[1], this.navy[2]);
      var titleLines = this.doc.splitTextToSize(title, colW);
      this.doc.text(titleLines, x, y0);
      var y = y0 + titleLines.length * 12 + 4;
      this.doc.setFont("helvetica", "normal");
      this.doc.setFontSize(8.6);
      this.doc.setTextColor(this.ink[0], this.ink[1], this.ink[2]);
      if (name) {
        this.doc.text(name, x, y);
        y += 22;
      } else {
        y += 14;
      }
      this.doc.setDrawColor(26, 35, 54);
      this.doc.setLineWidth(0.7);
      this.doc.line(x, y + 18, x + colW, y + 18);
      this.doc.setFontSize(7.6);
      this.doc.setTextColor(this.muted[0], this.muted[1], this.muted[2]);
      this.doc.text("Authorized Signature", x, y + 30);
      this.doc.line(x, y + 58, x + 130, y + 58);
      this.doc.text("Date", x, y + 70);
    }.bind(this);

    draw(
      leftX,
      "Developer: " + d.developerEntity,
      d.developerSigner + (d.developerTitle ? ", " + d.developerTitle : "")
    );
    draw(
      rightX,
      "Client: " + (d.clientName || "[Client Name]"),
      (d.clientSigner || "Authorized signer") + (d.clientTitle ? ", " + d.clientTitle : "")
    );
    this.y += 150;
  };

  async function downloadPdf() {
    var d = collect();
    var err = validate(d);
    if (err) {
      errorEl.textContent = err;
      errorEl.classList.add("is-on");
      errorEl.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    if (!window.jspdf || !window.jspdf.jsPDF) {
      errorEl.textContent = "PDF library failed to load. Check your connection and refresh.";
      errorEl.classList.add("is-on");
      return;
    }

    downloadBtn.disabled = true;
    downloadBtn.textContent = "Building PDF…";

    try {
      var logo = await loadLogo();
      var doc = new window.jspdf.jsPDF({ unit: "pt", format: "letter", compress: true });
      doc.setProperties({
        title: "Development Services Agreement" + (d.projectName ? " — " + d.projectName : ""),
        author: d.developerEntity,
        subject: "Agreement with " + d.clientName,
        creator: "STL Apps LLC contract generator"
      });
      var w = new PdfWriter(doc, logo);
      var model = buildModel(d);

      w.doc.setFont("helvetica", "bold");
      w.doc.setFontSize(16);
      w.doc.setTextColor(w.navy[0], w.navy[1], w.navy[2]);
      w.doc.text(model.title, w.pageW / 2, w.y, { align: "center" });
      w.y += 16;
      if (d.projectName) {
        w.doc.setFont("helvetica", "normal");
        w.doc.setFontSize(10);
        w.doc.setTextColor(w.muted[0], w.muted[1], w.muted[2]);
        w.doc.text("Project: " + d.projectName, w.pageW / 2, w.y, { align: "center" });
        w.y += 10;
      }
      w.doc.setFont("helvetica", "normal");
      w.doc.setFontSize(9);
      w.doc.setTextColor(w.muted[0], w.muted[1], w.muted[2]);
      w.doc.text("Effective Date: " + formatDate(d.effectiveDate), w.pageW / 2, w.y, { align: "center" });
      w.y += 16;

      w.parties(d);
      w.p(model.intro, { after: 8 });

      model.sections.forEach(function (section) {
        w.h2(section.num, section.title);
        section.blocks.forEach(function (block) {
          if (block.type === "items") w.items(d);
          else if (block.type === "sigs") w.sigs(d);
          else if (block.type === "lead") w.lead(block.lead, block.text);
          else w.p(block.text);
        });
      });

      w.drawHeaderFooter();

      var name = "STL-Apps-LLC_Development-Agreement_" + slug(d.clientName) + "_" + (d.effectiveDate || todayISO()) + ".pdf";
      doc.save(name);
    } catch (e) {
      errorEl.textContent = "Could not build the PDF. Try again, or use a current desktop browser.";
      errorEl.classList.add("is-on");
    } finally {
      downloadBtn.disabled = false;
      downloadBtn.textContent = "Download PDF";
    }
  }

  addItemBtn.addEventListener("click", function () {
    addItemRow();
    refresh();
    var rows = itemsEl.querySelectorAll(".item-desc");
    rows[rows.length - 1].focus();
  });

  depositPercentInput.addEventListener("input", function () {
    depositManual = false;
    refresh();
  });

  depositAmountInput.addEventListener("input", function () {
    depositManual = text(depositAmountInput.value) !== "";
    refresh();
  });

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    downloadPdf();
  });

  form.addEventListener("input", function (e) {
    if (e.target === depositAmountInput || e.target === depositPercentInput) return;
    refresh();
  });

  downloadBtn.addEventListener("click", function () {
    downloadPdf();
  });

  resetBtn.addEventListener("click", function () {
    if (!window.confirm("Clear this draft and start over?")) return;
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (e) {}
    depositManual = false;
    form.reset();
    form.developerEntity.value = "STL Apps LLC";
    form.developerState.value = "Oklahoma";
    form.developerSigner.value = "Sean Tyler Lee";
    form.developerTitle.value = "Member";
    form.developerEmail.value = "seantylerlee@icloud.com";
    form.governingState.value = "Oklahoma";
    form.depositPercent.value = "50";
    form.hourlyRate.value = "150";
    form.revisionRounds.value = "2";
    form.reviewDays.value = "7";
    form.warrantyDays.value = "14";
    form.lateFee.value = "1.5";
    form.effectiveDate.value = todayISO();
    itemsEl.innerHTML = "";
    addItemRow();
    addItemRow();
    addItemRow();
    refresh();
  });

  restore();
  refresh();
})();

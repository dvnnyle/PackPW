import { useState } from 'react';
import { Linking, Modal, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { cardShadow, colors, DESKTOP_BREAKPOINT, fonts, SIDEBAR_WIDTH } from '../theme';
import { DAYS, formatNumber, MONTHS, parseDate } from '../format';

const TABS = [
  { key: 'overview', label: 'Oversikt' },
  { key: 'info', label: 'Mer info' },
];

// "09.10.2026" from "2026-10-09" or an ISO timestamp.
function norwegianDate(value) {
  const [y, m, d] = value.slice(0, 10).split('-');
  return `${d}.${m}.${y}`;
}

// One labelled value on the "Mer info" tab; with `href` it opens the phone app or mail app.
function InfoField({ label, value, href, icon, wide }) {
  const content = (
    <>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={styles.fieldValueRow}>
        {value && icon ? <Ionicons name={icon} size={15} color={colors.funbutler} /> : null}
        <Text style={[styles.fieldValue, href && value && styles.link]} selectable>
          {value || '–'}
        </Text>
      </View>
    </>
  );
  return href && value ? (
    <Pressable style={[styles.field, wide && styles.fieldWide]} onPress={() => Linking.openURL(href)}>
      {content}
    </Pressable>
  ) : (
    <View style={[styles.field, wide && styles.fieldWide]}>{content}</View>
  );
}

// The booker and booking facts, like the "Mer info" tab in FunButler.
function InfoTab({ booking, date }) {
  const { customer } = booking;
  return (
    <View style={styles.fields}>
      <InfoField label="Tid" value={`${date ? norwegianDate(date) : ''} ${booking.time}–${booking.endTime}`} />
      <InfoField label="Laget" value={booking.createdAt ? norwegianDate(booking.createdAt) : null} />
      <InfoField label="Fornavn" value={customer.firstName} />
      <InfoField label="Etternavn" value={customer.lastName} />
      <InfoField label="Telefon" value={customer.phone} icon="call-outline" wide href={`tel:${customer.phone?.replace(/\s/g, '')}`} />
      <InfoField label="E-post" value={customer.email} icon="mail-outline" wide href={`mailto:${customer.email}`} />
      <InfoField label="Personer" value={String(booking.guests)} />
      <InfoField label="Pakke" value={booking.name} />
      <InfoField label="Intern kommentar" value={booking.staffComment} wide />
    </View>
  );
}

// Read-only details for one FunButler booking, like the booking view in FunButler's web app.
// Changes (check-in, cancelling) are still done in FunButler itself.
export default function BookingModal({ booking, date, onClose }) {
  const d = date ? parseDate(date) : null;
  const [tab, setTab] = useState('overview');
  // On desktop, center over the content column, not over the sidebar too.
  const desktop = useWindowDimensions().width >= DESKTOP_BREAKPOINT;
  const close = () => {
    setTab('overview');
    onClose();
  };
  return (
    <Modal visible={!!booking} transparent animationType="fade" onRequestClose={close}>
      {/* Tapping the dimmed background closes the modal. */}
      <Pressable style={[styles.backdrop, desktop && { paddingLeft: SIDEBAR_WIDTH + 16 }]} onPress={close} accessibilityLabel="Lukk">
        {booking ? (
          // Inner Pressable swallows taps so they don't reach the backdrop.
          <Pressable style={styles.card} onPress={() => {}}>
            <View style={styles.header}>
              <Text style={styles.title}>
                Booking #{booking.bookingNumber}
                {booking.customerName ? ` – ${booking.customerName}` : ''}
              </Text>
              <Pressable onPress={close} hitSlop={10} accessibilityLabel="Lukk">
                <Ionicons name="close" size={22} color={colors.muted} />
              </Pressable>
            </View>
            <Text style={styles.muted}>
              {d ? `${DAYS[d.getDay()]} ${String(d.getDate()).padStart(2, '0')} ${MONTHS[d.getMonth()]} · ` : ''}
              {booking.time}–{booking.endTime} · {booking.guests} gjester
            </Text>

            <View style={styles.tabs}>
              {TABS.map((t) => (
                <Pressable
                  key={t.key}
                  style={[styles.tab, tab === t.key && styles.tabActive]}
                  onPress={() => setTab(t.key)}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: tab === t.key }}
                >
                  <Text style={[styles.tabText, tab === t.key && styles.tabTextActive]}>{t.label}</Text>
                </Pressable>
              ))}
            </View>

            <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
              {tab === 'info' ? <InfoTab booking={booking} date={date} /> : null}
              {tab === 'overview' && booking.birthdayChildren.length > 0 ? (
                <View>
                  <Text style={styles.label}>Bursdagsbarn</Text>
                  {booking.birthdayChildren.map((child, i) => (
                    <Text key={i} style={styles.child}>
                      {child.name}
                      {child.age != null ? ` ${child.age} år` : ''}
                      {child.birthDate ? <Text style={styles.muted}> ({child.birthDate})</Text> : null}
                    </Text>
                  ))}
                </View>
              ) : null}

              {tab === 'overview' ? (
              <View>
                <View style={[styles.row, styles.headRow]}>
                  <Text style={[styles.cellName, styles.headText]}>Navn</Text>
                  <Text style={[styles.cellNum, styles.headText]}>Antall</Text>
                  <Text style={[styles.cellNum, styles.headText]}>pris/stk</Text>
                  <Text style={[styles.cellNum, styles.headText]}>Totalt</Text>
                </View>
                {booking.orderRows.map((row, i) => (
                  <View key={i} style={styles.row}>
                    <Text style={styles.cellName}>{row.name}</Text>
                    <Text style={styles.cellNum}>{row.quantity}</Text>
                    <Text style={styles.cellNum}>{formatNumber(row.unitPrice)} kr</Text>
                    <Text style={styles.cellNum}>{formatNumber(row.total)} kr</Text>
                  </View>
                ))}
              </View>
              ) : null}

              {tab === 'overview' && booking.staffComment ? (
                <View style={styles.comment}>
                  <Text style={styles.label}>Kommentar</Text>
                  <Text style={styles.commentText}>{booking.staffComment}</Text>
                </View>
              ) : null}
            </ScrollView>

            <View style={styles.footer}>
              <Text style={styles.total}>{booking.price != null ? `${formatNumber(booking.price)} kr` : '–'}</Text>
              <View style={[styles.status, booking.paid ? styles.statusPaid : styles.statusUnpaid]}>
                <Ionicons
                  name={booking.paid ? 'checkmark-circle' : 'alert-circle'}
                  size={14}
                  color={booking.paid ? '#15803d' : '#b91c1c'}
                />
                <Text style={[styles.statusText, { color: booking.paid ? '#15803d' : '#b91c1c' }]}>
                  {booking.paid ? 'Betalt' : 'Ikke betalt'}
                </Text>
              </View>
            </View>
          </Pressable>
        ) : null}
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(17, 24, 39, 0.45)', justifyContent: 'center', alignItems: 'center', padding: 16 },
  card: {
    width: '100%',
    maxWidth: 560,
    maxHeight: '90%',
    backgroundColor: colors.surface,
    borderRadius: 20,
    padding: 18,
    gap: 6,
    ...cardShadow,
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  title: { flex: 1, fontFamily: fonts.heading, fontSize: 20, color: colors.text },
  muted: { fontFamily: fonts.regular, fontSize: 13, color: colors.muted },
  body: { marginTop: 4 },
  tabs: { flexDirection: 'row', gap: 4, borderBottomWidth: 1, borderBottomColor: colors.border, marginTop: 8 },
  tab: { paddingVertical: 8, paddingHorizontal: 12, borderBottomWidth: 2, borderBottomColor: 'transparent', marginBottom: -1 },
  tabActive: { borderBottomColor: colors.funbutler },
  tabText: { fontFamily: fonts.semibold, fontSize: 14, color: colors.muted },
  tabTextActive: { color: colors.funbutler },
  fields: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, paddingTop: 8 },
  field: { flexGrow: 1, flexBasis: '45%', backgroundColor: '#f6f7f9', borderRadius: 12, padding: 10, gap: 2 },
  fieldWide: { flexBasis: '100%' },
  fieldLabel: { fontFamily: fonts.medium, fontSize: 11, color: colors.muted, textTransform: 'uppercase' },
  fieldValueRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  fieldValue: { fontFamily: fonts.semibold, fontSize: 14, color: colors.text, flexShrink: 1 },
  link: { color: colors.funbutler },
  bodyContent: { gap: 16, paddingBottom: 4 },
  label: { fontFamily: fonts.semibold, fontSize: 13, color: colors.muted, textTransform: 'uppercase', marginBottom: 4 },
  child: { fontFamily: fonts.semibold, fontSize: 15, color: colors.text },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 9,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  headRow: { borderBottomColor: colors.muted },
  headText: { fontFamily: fonts.semibold, fontSize: 12, color: colors.muted },
  cellName: { flex: 1, fontFamily: fonts.regular, fontSize: 13, color: colors.text },
  cellNum: { width: 64, textAlign: 'right', fontFamily: fonts.regular, fontSize: 13, color: colors.text },
  comment: { backgroundColor: '#f6f7f9', borderRadius: 12, padding: 12 },
  commentText: { fontFamily: fonts.regular, fontSize: 14, color: colors.text },
  footer: {
    alignItems: 'center',
    gap: 6,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 12,
    marginTop: 4,
  },
  total: { fontFamily: fonts.semibold, fontSize: 22, color: colors.text },
  status: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 4 },
  statusPaid: { backgroundColor: '#dcfce7' },
  statusUnpaid: { backgroundColor: '#fee2e2' },
  statusText: { fontFamily: fonts.semibold, fontSize: 13 },
});
